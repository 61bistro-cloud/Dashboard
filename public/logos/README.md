# Bank Logos

Drop bank logo files here. The `BankLogo` component auto-loads them by filename matching the `BankAccount.code`:

| ไฟล์ที่ต้องวาง            | สำหรับ                                |
| ------------------------- | ------------------------------------- |
| `kbank.png` (หรือ `.svg`) | ธนาคารกสิกรไทย (KBANK)                |
| `scb.png` (หรือ `.svg`)   | ธนาคารไทยพาณิชย์ (SCB)                |
| `cash.png` (optional)     | เงินสด (CASH) — ปกติใช้ icon เริ่มต้น |

## คุณภาพที่แนะนำ

- **Format**: PNG (transparent) หรือ SVG
- **ขนาด**: ≥ 256x256 px (square) — component จะ scale ลงเป็น ~36px display
- **Background**: ใส (transparent) จะดูดีสุด

## ถ้าไม่มีไฟล์

Component จะ fallback เป็น **monogram** (ตัวอักษรแรกบนพื้นสี brand) อัตโนมัติ — ใช้ได้เลยไม่ error
