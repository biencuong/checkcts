# -*- coding: utf-8 -*-
"""
CheckCTS - Ban offline (GUI) - kiem tra file PDF da ky so va USB token dang cam.
Khong can cai dat: dong goi bang PyInstaller --onefile --windowed -> CheckCTS.exe portable.

Tai dung lai logic trong checkcts.py (check_pdf, check_token_pkcs11, check_windows_store).
"""
import io
import os
import sys
import threading
import contextlib
import queue
from datetime import datetime

import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext

import checkcts  # tai dung cac ham da co


class CheckCTSApp:
    def __init__(self, root):
        self.root = root
        root.title("CheckCTS - Kiem tra chu ky so (ban offline)")
        root.geometry("900x600")

        self.pdf_path = tk.StringVar(value="")
        self._q = queue.Queue()
        self._busy = False

        self._build_ui()
        self.root.after(100, self._drain_queue)

    def _build_ui(self):
        top = ttk.Frame(self.root, padding=8)
        top.pack(fill="x")

        ttk.Label(top, text="File PDF:").grid(row=0, column=0, sticky="w")
        ent = ttk.Entry(top, textvariable=self.pdf_path, width=70)
        ent.grid(row=0, column=1, sticky="we", padx=4)
        ttk.Button(top, text="Chọn file...", command=self._choose_pdf).grid(row=0, column=2, padx=2)
        top.columnconfigure(1, weight=1)

        btns = ttk.Frame(self.root, padding=(8, 0))
        btns.pack(fill="x")
        self.btn_pdf = ttk.Button(btns, text="Kiểm tra file PDF", command=self._run_pdf)
        self.btn_pdf.pack(side="left", padx=2)
        self.btn_token = ttk.Button(btns, text="Đọc USB token", command=self._run_token)
        self.btn_token.pack(side="left", padx=2)
        self.btn_both = ttk.Button(btns, text="Kiểm tra cả hai", command=self._run_both)
        self.btn_both.pack(side="left", padx=2)
        ttk.Button(btns, text="Xóa", command=self._clear).pack(side="left", padx=2)
        self.btn_save = ttk.Button(btns, text="Lưu kết quả ra .txt", command=self._save_txt)
        self.btn_save.pack(side="right", padx=2)

        self.status = ttk.Label(self.root, text="Sẵn sàng", anchor="w", padding=(8, 2))
        self.status.pack(fill="x")

        self.out = scrolledtext.ScrolledText(self.root, wrap="word", font=("Consolas", 10))
        self.out.pack(fill="both", expand=True, padx=8, pady=8)

    # ---- chay tac vu trong thread, bat stdout cua checkcts ----
    def _choose_pdf(self):
        p = filedialog.askopenfilename(
            title="Chọn file PDF đã ký",
            filetypes=[("PDF", "*.pdf"), ("Tất cả", "*.*")],
        )
        if p:
            self.pdf_path.set(p)

    def _set_busy(self, busy, msg=""):
        self._busy = busy
        state = "disabled" if busy else "normal"
        for b in (self.btn_pdf, self.btn_token, self.btn_both):
            b.config(state=state)
        if msg:
            self.status.config(text=msg)

    def _run_in_thread(self, fn, start_msg):
        if self._busy:
            return
        self._set_busy(True, start_msg)
        self.out.insert("end", f"\n----- {start_msg} ({datetime.now():%H:%M:%S}) -----\n")
        self.out.see("end")

        def worker():
            buf = io.StringIO()
            try:
                with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
                    fn()
            except Exception as e:
                buf.write(f"\n[LỖI] {e}\n")
            self._q.put(("text", buf.getvalue()))
            self._q.put(("done", None))

        threading.Thread(target=worker, daemon=True).start()

    def _drain_queue(self):
        try:
            while True:
                kind, payload = self._q.get_nowait()
                if kind == "text":
                    self.out.insert("end", payload)
                    self.out.see("end")
                elif kind == "done":
                    self._set_busy(False, "Hoàn tất")
        except queue.Empty:
            pass
        self.root.after(100, self._drain_queue)

    def _run_pdf(self):
        p = self.pdf_path.get().strip()
        if not p:
            messagebox.showwarning("Thiếu file", "Hãy chọn file PDF trước.")
            return
        self._run_in_thread(lambda: checkcts.check_pdf(p), "Kiểm tra file PDF")

    def _run_token(self):
        def task():
            ok = checkcts.check_token_pkcs11()
            if not ok:
                checkcts.check_windows_store()
        self._run_in_thread(task, "Đọc USB token")

    def _run_both(self):
        p = self.pdf_path.get().strip()

        def task():
            if p:
                checkcts.check_pdf(p)
            else:
                print("(Chưa chọn file PDF - bỏ qua phần kiểm tra file)")
            ok = checkcts.check_token_pkcs11()
            if not ok:
                checkcts.check_windows_store()
        self._run_in_thread(task, "Kiểm tra cả file PDF và token")

    def _clear(self):
        self.out.delete("1.0", "end")

    def _save_txt(self):
        content = self.out.get("1.0", "end").strip()
        if not content:
            messagebox.showinfo("Trống", "Chưa có kết quả để lưu.")
            return
        default = f"CheckCTS_{datetime.now():%Y%m%d_%H%M%S}.txt"
        p = filedialog.asksaveasfilename(
            title="Lưu kết quả",
            defaultextension=".txt",
            initialfile=default,
            filetypes=[("Text", "*.txt")],
        )
        if not p:
            return
        try:
            with open(p, "w", encoding="utf-8") as f:
                f.write(content + "\n")
            self.status.config(text=f"Đã lưu: {p}")
            messagebox.showinfo("Đã lưu", f"Kết quả đã lưu:\n{p}")
        except Exception as e:
            messagebox.showerror("Lỗi", f"Không lưu được: {e}")


def main():
    root = tk.Tk()
    try:
        ttk.Style().theme_use("vista")
    except Exception:
        pass
    CheckCTSApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
