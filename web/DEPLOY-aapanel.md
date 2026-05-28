# Triển khai CheckCTS web trên aaPanel

Bộ cài này chạy **phần web app** (kiểm tra PDF đã ký + xuất Excel/PDF + lịch sử nội bộ) trên server Linux do aaPanel quản lý.

> **Quan trọng — đọc USB token KHÔNG chạy trên server.** Token cắm ở máy người dùng, nên việc đọc token vẫn do **CheckCTS-Agent.exe** (hoặc bản offline `CheckCTS.exe`) chạy trên PC của người dùng đảm nhiệm; trình duyệt gọi vào `http://127.0.0.1:8765`. Server chỉ phục vụ giao diện + kiểm tra PDF + báo cáo + lịch sử.

## 1. Yêu cầu trên server
- aaPanel đã cài.
- **Node.js 18+** (khuyến nghị LTS). Cài qua aaPanel: *App Store → "PM2 Manager"* (kèm Node) hoặc *"Node Version Manager"*.
- (Khuyến nghị) **PM2** để giữ tiến trình chạy nền.
- Gói font tiếng Việt (DejaVu/Noto) — `install.sh` sẽ tự cài; nếu không có quyền, xem mục Font bên dưới.

## 2. Tải lên & giải nén
1. Mở **aaPanel → Files**, tạo thư mục ví dụ `/www/wwwroot/checkcts`.
2. Tải `checkcts-web-aapanel.zip` lên thư mục đó rồi **giải nén** (nội dung nằm trong `checkcts-web/`).
3. Vào thư mục `checkcts-web` (chứa `server.js`).

## 3. Cài đặt
### Cách A — dùng script (SSH/Terminal)
```bash
cd /www/wwwroot/checkcts/checkcts-web
# nếu file .sh có lỗi xuống dòng Windows:  sed -i 's/\r$//' install.sh
bash install.sh
```
Script sẽ: kiểm tra Node → cài font tiếng Việt → `npm install` → tạo `data/` → chạy PM2.

### Cách B — dùng giao diện aaPanel (Node Project)
1. *App Store → "Node Project" (Node.js 项目) → Add Project*.
2. Project path: thư mục `checkcts-web`; **Startup file:** `server.js`; Node version: 18+.
3. Cho phép aaPanel chạy `npm install`.
4. Đặt biến môi trường: `PORT=3900`, `CHECKCTS_ADMIN_KEY=<khóa-bí-mật-của-bạn>`.
5. Start project.

## 4. Reverse Proxy + tên miền
1. *Website → Add site* (tạo domain, ví dụ `cks.tenmien.vn`).
2. Vào site → **Reverse Proxy → Add**: Target URL `http://127.0.0.1:3900`.
3. (Khuyến nghị) **SSL** cho domain (Let's Encrypt trong aaPanel).

## 5. Biến môi trường
| Biến | Mặc định | Ý nghĩa |
|------|----------|---------|
| `PORT` | `3900` | Cổng nội bộ Node (Nginx proxy trỏ vào) |
| `CHECKCTS_ADMIN_KEY` | `sgdtuyenquang` (server.js) | **BẮT BUỘC đổi.** Khóa mở `/api/history` |
| `CHECKCTS_FONT` / `CHECKCTS_FONT_BOLD` | (tự dò) | Chỉ định font tiếng Việt cho PDF nếu cần |

Đặt qua `ecosystem.config.js` (sửa `CHECKCTS_ADMIN_KEY`) hoặc phần Env của aaPanel Node Project.

## 6. Lưu ý quan trọng
- **HTTPS + agent đọc token:** nếu web chạy qua **HTTPS**, trình duyệt có thể chặn *mixed content* khi gọi agent ở `http://127.0.0.1:8765`. Nếu gặp, người dùng dùng **bản offline `.exe`** để đọc token, hoặc truy cập web qua HTTP nội bộ. Phần kiểm tra PDF + báo cáo không bị ảnh hưởng.
- **Dữ liệu cá nhân:** lịch sử lưu ở `data/checkcts.db` (tên người ký, serial CKS). Bộ cài này **không** kèm DB cũ. Sao lưu/bảo mật file này phù hợp; cân nhắc đổi `CHECKCTS_ADMIN_KEY` mạnh và giới hạn truy cập `/api/history`.
- **better-sqlite3** là native module. Nếu `npm install` báo lỗi biên dịch:
  - apt: `sudo apt-get install -y build-essential python3`
  - yum/dnf: `sudo yum groupinstall -y 'Development Tools' && sudo yum install -y python3`
  - rồi `npm rebuild better-sqlite3`.
- **Font tiếng Việt cho PDF:** nếu không cài được gói font hệ thống, đặt 2 file `DejaVuSans.ttf` và `DejaVuSans-Bold.ttf` vào thư mục `fonts/` của bộ cài (app sẽ tự nhận).

## 7. Vận hành (PM2)
```bash
pm2 status
pm2 logs checkcts-web
pm2 restart checkcts-web
pm2 stop checkcts-web
```
