# CheckCTS — Kiểm tra chữ ký số & USB token (CKS)

Công cụ kiểm tra **chữ ký số trên file PDF** và đọc **thông tin chứng thư trong USB token (chữ ký số)** đang cắm trên máy. Gồm 3 phần: web app, agent đọc token cho web, và bản offline portable. Hỗ trợ tiếng Việt đầy đủ và **cảnh báo đơn vị hành chính hết hiệu lực** theo thay đổi từ 01/7/2025.

## Tải về (binary)

Tải file chạy ngay (không cần cài) từ trang **Releases**:

- **CheckCTS-Agent.exe** — agent đọc token cho web:
  https://github.com/biencuong/checkcts/releases/latest/download/CheckCTS-Agent.exe
- **CheckCTS.exe** — bản offline đầy đủ (giao diện, đọc PDF + token, lưu .txt):
  https://github.com/biencuong/checkcts/releases/latest/download/CheckCTS.exe

> Hai file `.exe` không nằm trong mã nguồn (vượt giới hạn dung lượng của GitHub) mà được phát hành ở mục **Releases**.

## Thành phần

| Phần | File | Vai trò |
|------|------|---------|
| Web app | `web/` (Node.js) | Upload PDF → kiểm tra chữ ký; đọc token qua agent; xuất báo cáo Excel/PDF |
| Agent local | `agent.py` → `CheckCTS-Agent.exe` | HTTP server `127.0.0.1:8765` (có CORS), đọc token qua PKCS#11 để web gọi vào |
| Bản offline | `gui_check.py` → `CheckCTS.exe` | Giao diện Tkinter, đọc PDF + token, lưu kết quả ra `.txt` |
| Lõi xử lý | `checkcts.py` | Đọc chữ ký PDF (pyhanko) và token (PKCS#11) |

## Cách dùng (trên web)

### Cách 1 — Ký tài liệu rồi đẩy lên web để kiểm tra
1. Ký file **PDF** bằng phần mềm ký số của bạn (VGCA SignService, Foxit…), dùng USB token.
2. Mở web, kéo–thả file PDF đã ký vào mục "Kiểm tra file PDF".
3. Web hiển thị: người ký, **đơn vị (OU)**, **cơ quan chủ quản (O)**, serial, hạn, tính toàn vẹn, dấu thời gian (TSA).
4. Bấm "Xuất Excel / PDF" để lưu biên bản.

### Cách 2 — Kiểm tra bằng công cụ tải về (đọc trực tiếp USB token)
1. Tải **CheckCTS-Agent.exe** (đọc token trên web) hoặc **CheckCTS.exe** (bản offline đầy đủ).
2. Chạy file (không cần cài):
   - *Agent:* để cửa sổ "Đang chạy" mở → quay lại web bấm "Dò & đọc token".
   - *Offline:* mở giao diện → chọn PDF hoặc "Đọc token" → xem kết quả → "Lưu ra .txt".

## Cài đặt & chạy mã nguồn

Yêu cầu: **Node.js 18+**, **Python 3.10+**, driver PKCS#11 của USB token (vd Feitian `eps2003csp11.dll`, VGCA `bit4xpki.dll`, SafeNet `eTPKCS11.dll`…).

```bash
# Web
cd web
npm install
node server.js            # http://localhost:3900

# Agent đọc token (cửa sổ riêng)
pip install PyKCS11 pyhanko cryptography
python agent.py           # http://127.0.0.1:8765
```

Trên Windows có thể dùng nhanh:
- `start.bat` — chạy web + agent + mở trình duyệt.
- `stop.bat` — tắt cả hai.

## Đóng gói file .exe (PyInstaller)

```bash
pip install pyinstaller
# Bản offline đầy đủ
pyinstaller --onefile --windowed --name CheckCTS --collect-all pyhanko --collect-all pyhanko_certvalidator --collect-all asn1crypto --collect-all oscrypto --collect-submodules PyKCS11 --collect-submodules cryptography gui_check.py
# Agent (gọn nhẹ)
pyinstaller --onefile --name CheckCTS-Agent --collect-submodules PyKCS11 --exclude-module pyhanko --exclude-module cryptography agent.py
```
File tạo ra ở `dist/`. Tải các file này lên **Releases** của repo để link tải trên web hoạt động.

## Cảnh báo đơn vị hành chính (từ 01/7/2025)

Cả nước áp dụng **chính quyền 2 cấp** (tỉnh – xã), **bỏ cấp Huyện**; **tỉnh Hà Giang đã sáp nhập vào tỉnh Tuyên Quang**. Công cụ tự cảnh báo khi chứng thư còn ghi:
- **"tỉnh Hà Giang"** → tỉnh đã sáp nhập, không còn phù hợp.
- **"Huyện …"** → không còn cấp huyện.

## Giấy phép

Xem file [LICENSE](LICENSE).
