import { Readable } from "stream";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

const FOLDER_MIME = "application/vnd.google-apps.folder";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  // drive.file alone is enough for BOTH Drive uploads AND editing the Master
  // Sheet we create — the Sheets API accepts drive.file for app-created
  // spreadsheets. It's NON-sensitive, so Google requires no app verification.
  "https://www.googleapis.com/auth/drive.file",
];

export function googleConfigured(): boolean {
  return !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}

/** OAuth2 client (optionally with a redirect URI for the consent flow). */
export function oauthClient(redirectUri?: string) {
  return new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
    redirectUri
  );
}

/** Build the Google consent URL that asks for Drive + Sheets (offline access). */
export function consentUrl(redirectUri: string, state: string) {
  return oauthClient(redirectUri).generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force a refresh_token every time
    include_granted_scopes: true,
    scope: GOOGLE_SCOPES,
    state,
  });
}

/** Exchange an auth code for tokens + the connected account's email. */
export async function exchangeCode(redirectUri: string, code: string) {
  const client = oauthClient(redirectUri);
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  let email: string | null = null;
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const me = await oauth2.userinfo.get();
    email = me.data.email ?? null;
  } catch {
    /* email is best-effort */
  }
  return { refreshToken: tokens.refresh_token ?? null, email };
}

type Biz = {
  id: number;
  name: string;
  googleRefreshToken: string | null;
  driveRootFolderId: string | null;
  driveSlipFolderId: string | null;
  driveBillFolderId: string | null;
  masterSheetId: string | null;
};

async function getBiz(businessId: number): Promise<Biz> {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      googleRefreshToken: true,
      driveRootFolderId: true,
      driveSlipFolderId: true,
      driveBillFolderId: true,
      masterSheetId: true,
    },
  });
  if (!b) throw new Error("ไม่พบธุรกิจ");
  return b;
}

function clientFor(b: Biz) {
  if (!b.googleRefreshToken) {
    throw new Error(
      "ยังไม่ได้เชื่อม Google Drive — กดปุ่ม “เชื่อม Google” ก่อน"
    );
  }
  const c = oauthClient();
  c.setCredentials({ refresh_token: b.googleRefreshToken });
  return c;
}

async function findOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId?: string
): Promise<string> {
  const q = [
    `mimeType='${FOLDER_MIME}'`,
    `name='${name.replace(/'/g, "\\'")}'`,
    "trashed=false",
    parentId ? `'${parentId}' in parents` : null,
  ]
    .filter(Boolean)
    .join(" and ");
  const found = await drive.files.list({ q, fields: "files(id)", pageSize: 1 });
  if (found.data.files?.[0]?.id) return found.data.files[0].id!;
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: FOLDER_MIME,
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
  });
  return created.data.id!;
}

/** Ensure the Drive folder tree + Master Sheet exist; persist their ids. */
export async function ensureStructure(businessId: number) {
  const b = await getBiz(businessId);
  const auth = clientFor(b);
  const drive = google.drive({ version: "v3", auth });
  const sheets = google.sheets({ version: "v4", auth });

  let {
    driveRootFolderId,
    driveSlipFolderId,
    driveBillFolderId,
    masterSheetId,
  } = b;

  if (!driveRootFolderId) {
    driveRootFolderId = await findOrCreateFolder(
      drive,
      `${b.name} (ระบบบัญชี)`
    );
  }
  if (!driveSlipFolderId) {
    driveSlipFolderId = await findOrCreateFolder(
      drive,
      "หลักฐานการโอน",
      driveRootFolderId
    );
  }
  if (!driveBillFolderId) {
    driveBillFolderId = await findOrCreateFolder(
      drive,
      "บิลซื้อ",
      driveRootFolderId
    );
  }
  if (!masterSheetId) {
    const created = await sheets.spreadsheets.create({
      requestBody: { properties: { title: `Master Sheet — ${b.name}` } },
      fields: "spreadsheetId",
    });
    masterSheetId = created.data.spreadsheetId!;
    // move it inside the root folder
    await drive.files.update({
      fileId: masterSheetId,
      addParents: driveRootFolderId,
      fields: "id",
    });
  }

  await prisma.business.update({
    where: { id: businessId },
    data: {
      driveRootFolderId,
      driveSlipFolderId,
      driveBillFolderId,
      masterSheetId,
    },
  });

  return {
    driveRootFolderId,
    driveSlipFolderId,
    driveBillFolderId,
    masterSheetId,
  };
}

/** Overwrite one tab with a 2-D array of values (creates the tab if missing). */
async function writeTab(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  title: string,
  values: (string | number)[][]
) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === title);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] },
    });
  }
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${title}'`,
  });
  if (values.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${title}'!A1`,
      valueInputOption: "RAW",
      requestBody: { values },
    });
  }
}

/** Push all data tabs into the Master Sheet. `tabs` built by google-sheets-data. */
export async function syncMaster(
  businessId: number,
  tabs: { title: string; values: (string | number)[][] }[]
) {
  const ids = await ensureStructure(businessId);
  const b = await getBiz(businessId);
  const auth = clientFor(b);
  const sheets = google.sheets({ version: "v4", auth });

  for (const tab of tabs) {
    await writeTab(sheets, ids.masterSheetId, tab.title, tab.values);
  }
  // Remove the default empty "Sheet1" if our tabs replaced it
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: ids.masterSheetId,
    fields: "sheets.properties(sheetId,title)",
  });
  const ours = new Set(tabs.map((t) => t.title));
  const sheet1 = meta.data.sheets?.find(
    (s) => s.properties?.title === "Sheet1" && !ours.has("Sheet1")
  );
  if (sheet1 && (meta.data.sheets?.length ?? 0) > tabs.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: ids.masterSheetId,
      requestBody: {
        requests: [{ deleteSheet: { sheetId: sheet1.properties!.sheetId! } }],
      },
    });
  }

  await prisma.business.update({
    where: { id: businessId },
    data: { googleSyncedAt: new Date() },
  });
  return `https://docs.google.com/spreadsheets/d/${ids.masterSheetId}`;
}

/** Upload one evidence file into the right Drive folder (per month). */
export async function uploadEvidence(
  businessId: number,
  kind: "SLIP" | "BILL",
  monthFolderName: string | null, // e.g. "2569-06"
  file: { name: string; mimeType: string; buffer: Buffer }
) {
  const ids = await ensureStructure(businessId);
  const b = await getBiz(businessId);
  const auth = clientFor(b);
  const drive = google.drive({ version: "v3", auth });

  const parentBase =
    kind === "SLIP" ? ids.driveSlipFolderId : ids.driveBillFolderId;
  const parent = monthFolderName
    ? await findOrCreateFolder(drive, monthFolderName, parentBase)
    : parentBase;

  const created = await drive.files.create({
    requestBody: { name: file.name, parents: [parent] },
    media: { mimeType: file.mimeType, body: Readable.from(file.buffer) },
    fields: "id, webViewLink",
  });
  return {
    driveFileId: created.data.id!,
    webViewLink:
      created.data.webViewLink ??
      `https://drive.google.com/file/d/${created.data.id}/view`,
  };
}

export function folderUrl(id: string | null) {
  return id ? `https://drive.google.com/drive/folders/${id}` : null;
}
export function sheetUrl(id: string | null) {
  return id ? `https://docs.google.com/spreadsheets/d/${id}` : null;
}
