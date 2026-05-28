# -*- coding: utf-8 -*-
"""
CheckCTS - Kiem tra thong tin file da ky so (PDF) va USB token (chu ky so) dang cam.

Cach dung:
    python checkcts.py                      # doc file PDF trong thu muc + do USB token
    python checkcts.py file "duong_dan.pdf" # chi doc 1 file PDF da ky
    python checkcts.py token                # chi do USB token / kho cert Windows
"""
import sys
import os
import glob
import subprocess
from datetime import datetime, timezone

# Ep console in tieng Viet (UTF-8) - tranh loi 'charmap' tren Windows
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


# ----------------------------------------------------------------------------
# Tien ich in
# ----------------------------------------------------------------------------
def hr(title=""):
    line = "=" * 70
    if title:
        print(f"\n{line}\n{title}\n{line}")
    else:
        print(line)


def fmt_dt(dt):
    if dt is None:
        return "(khong co)"
    if isinstance(dt, datetime):
        return dt.astimezone().strftime("%Y-%m-%d %H:%M:%S %Z")
    return str(dt)


def name_to_str(name):
    """Chuyen X.509 Name (cryptography) sang chuoi de doc."""
    try:
        from cryptography.x509.oid import NameOID
        parts = []
        wanted = [
            ("CN", NameOID.COMMON_NAME),
            ("O", NameOID.ORGANIZATION_NAME),
            ("OU", NameOID.ORGANIZATIONAL_UNIT_NAME),
            ("Email", NameOID.EMAIL_ADDRESS),
            ("L", NameOID.LOCALITY_NAME),
            ("ST", NameOID.STATE_OR_PROVINCE_NAME),
            ("C", NameOID.COUNTRY_NAME),
            ("Serial", NameOID.SERIAL_NUMBER),
        ]
        for label, oid in wanted:
            attrs = name.get_attributes_for_oid(oid)
            for a in attrs:
                parts.append(f"{label}={a.value}")
        return ", ".join(parts) if parts else name.rfc4514_string()
    except Exception:
        return str(name)


def get_attr(name, oid):
    """Lay gia tri dau tien cua mot OID trong X.509 Name, hoac None."""
    try:
        vals = name.get_attributes_for_oid(oid)
        return vals[0].value if vals else None
    except Exception:
        return None


def admin_warnings(*fields):
    """Canh bao don vi hanh chinh khong con phu hop (sap nhap + chinh quyen 2 cap tu 01/7/2025)."""
    text = " ".join(f for f in fields if f).upper()
    w = []
    if "HÀ GIANG" in text:
        w.append("Tinh Ha Giang da sap nhap vao tinh Tuyen Quang tu 01/7/2025 "
                 "- ten 'tinh Ha Giang' tren chung thu KHONG con phu hop.")
    if "HUYỆN" in text:
        w.append("Tu 01/7/2025 ap dung chinh quyen 2 cap (tinh - xa), KHONG con cap Huyen "
                 "- thong tin don vi cap huyen khong con phu hop.")
    return w


def print_cert(cert, indent="    "):
    """In thong tin mot chung thu so (cryptography.x509.Certificate)."""
    from cryptography.x509.oid import NameOID
    cn = get_attr(cert.subject, NameOID.COMMON_NAME)          # ten chu the
    o = get_attr(cert.subject, NameOID.ORGANIZATION_NAME)     # co quan chu quan
    ou = get_attr(cert.subject, NameOID.ORGANIZATIONAL_UNIT_NAME)  # don vi truc thuoc
    loc = get_attr(cert.subject, NameOID.LOCALITY_NAME)

    print(f"{indent}Ten chu the (CN)  : {cn or '(khong co)'}")
    # Don vi: uu tien OU (don vi truc thuoc), kem theo O (co quan chu quan)
    if ou and o:
        print(f"{indent}Don vi (OU)       : {ou}")
        print(f"{indent}Co quan chu quan (O): {o}")
    elif o:
        print(f"{indent}Don vi (O)        : {o}")
    elif ou:
        print(f"{indent}Don vi (OU)       : {ou}")
    else:
        print(f"{indent}Don vi            : (khong co)")
    print(f"{indent}Chu the day du    : {name_to_str(cert.subject)}")
    print(f"{indent}Nha phat hanh (CA): {name_to_str(cert.issuer)}")
    print(f"{indent}So serial         : {cert.serial_number:X}")
    try:
        nb = cert.not_valid_before_utc
        na = cert.not_valid_after_utc
    except AttributeError:
        nb = cert.not_valid_before.replace(tzinfo=timezone.utc)
        na = cert.not_valid_after.replace(tzinfo=timezone.utc)
    print(f"{indent}Hieu luc tu       : {fmt_dt(nb)}")
    print(f"{indent}Hieu luc den      : {fmt_dt(na)}")
    now = datetime.now(timezone.utc)
    if now < nb:
        print(f"{indent}Trang thai        : CHUA CO HIEU LUC")
    elif now > na:
        print(f"{indent}Trang thai        : DA HET HAN")
    else:
        days = (na - now).days
        print(f"{indent}Trang thai        : CON HIEU LUC (con {days} ngay)")
    print(f"{indent}Thuat toan ky     : {cert.signature_algorithm_oid._name}")
    # MST / so dinh danh thuong nam trong subject serialNumber
    try:
        from cryptography.x509.oid import NameOID
        sn = cert.subject.get_attributes_for_oid(NameOID.SERIAL_NUMBER)
        if sn:
            print(f"{indent}Ma dinh danh (MST): {sn[0].value}")
    except Exception:
        pass
    # Canh bao don vi hanh chinh da het hieu luc (Ha Giang sap nhap / bo cap Huyen)
    for w in admin_warnings(cn, o, ou, loc):
        print(f"{indent}*** CANH BAO (don vi het hieu luc): {w}")


# ----------------------------------------------------------------------------
# PHAN 1: Doc thong tin chu ky so trong file PDF
# ----------------------------------------------------------------------------
def check_pdf(path):
    hr(f"FILE DA KY SO: {path}")
    if not os.path.isfile(path):
        print("  [LOI] Khong tim thay file.")
        return

    import logging
    logging.getLogger("pyhanko").setLevel(logging.CRITICAL)  # tat log nhieu
    from pyhanko.pdf_utils.reader import PdfFileReader
    from pyhanko.sign.validation import validate_pdf_signature
    from pyhanko_certvalidator import ValidationContext
    from cryptography import x509

    with open(path, "rb") as f:
        # strict=False de doc duoc ca file hybrid-reference (rat pho bien o VN)
        reader = PdfFileReader(f, strict=False)
        sigs = reader.embedded_signatures
        if not sigs:
            print("  File KHONG co chu ky so (PKCS#7) nhung trong PDF.")
            return

        print(f"  So luong chu ky tim thay: {len(sigs)}")
        # ValidationContext khong co trust root -> chi kiem tra toan ven mat ma,
        # khong xac thuc chuoi tin cay (trusted). Cho phep lay het thong tin.
        vc = ValidationContext(allow_fetching=False, weak_hash_algos=set())

        for i, emb in enumerate(sigs, 1):
            hr(f"  Chu ky #{i}: truong '{emb.field_name}'")
            # Thong tin nguoi ky tu chung thu
            signer_cert_asn1 = emb.signer_cert
            try:
                cert = x509.load_der_x509_certificate(signer_cert_asn1.dump())
                print("  -- Nguoi ky / Chung thu so --")
                print_cert(cert, indent="     ")
            except Exception as e:
                print(f"     [Khong doc duoc chung thu nguoi ky: {e}]")

            # Thoi diem ky
            try:
                st = emb.self_reported_timestamp
                print(f"  -- Thoi diem ky (khai bao): {fmt_dt(st)}")
            except Exception:
                pass

            # Kiem tra toan ven + pham vi phu cua chu ky
            try:
                status = validate_pdf_signature(emb, vc)
                print("  -- Ket qua tham dinh --")
                print(f"     Toan ven (intact)        : {status.intact}")
                print(f"     Chu ky hop le (valid)    : {status.valid}")
                cov = status.coverage.name if status.coverage else "?"
                if cov == "ENTIRE_FILE":
                    cov_txt = "CO - phu toan bo file (chu ky cuoi cung)"
                elif cov in ("ENTIRE_REVISION", "CONTIGUOUS_BLOCK_FROM_START"):
                    cov_txt = ("Phu tron vung du lieu cua chu ky nay "
                               "(binh thuong voi PDF co nhieu chu ky - "
                               "phan them sau la cac chu ky ke tiep)")
                else:
                    cov_txt = f"{cov} - CANH BAO: file co the da bi sua sau khi ky"
                print(f"     Pham vi phu              : {cov_txt}")
                ml = getattr(status, "modification_level", None)
                if ml is not None:
                    print(f"     Muc do sua doi sau ky    : {ml.name}")
                print(f"     Tin cay chuoi CA (trusted): {status.trusted}")
                print(f"     Thuat toan dam (digest)  : {status.md_algorithm}")
                ts = getattr(status, "timestamp_validity", None)
                if ts is not None:
                    print(f"     Co dau thoi gian (TSA)   : co")
            except Exception as e:
                print(f"     [Khong tham dinh duoc: {e}]")


# ----------------------------------------------------------------------------
# PHAN 2: Do USB token qua PKCS#11
# ----------------------------------------------------------------------------
# Cac ten DLL driver PKCS#11 pho bien (token CTS o VN thuong la Feitian / SafeNet)
KNOWN_P11_DLLS = [
    "eps2003csp11.dll",     # Feitian ePass2003 (rat pho bien o VN)
    "ngp11v211.dll",        # Feitian
    "castle.dll",
    "eTPKCS11.dll",         # SafeNet eToken (Viettel-CA, VNPT-CA hay dung)
    "IDPrimePKCS11.dll",    # Gemalto/Thales
    "opensc-pkcs11.dll",    # OpenSC
    "cmP11.dll",
    "asepkcs.dll",
    "SignServer.dll",
    "PROCRYPTOKI.dll",
    "bit4xpki.dll",
    "gclib.dll",
]

SEARCH_DIRS = [
    os.environ.get("SystemRoot", r"C:\Windows") + r"\System32",
    os.environ.get("SystemRoot", r"C:\Windows") + r"\SysWOW64",
    os.environ.get("ProgramFiles", r"C:\Program Files"),
    os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"),
]


def find_pkcs11_dlls():
    found = []
    seen = set()
    # Chi quet thu muc dung bitness voi Python dang chay
    # (Python 64-bit chi nap duoc DLL 64-bit = System32; 32-bit = SysWOW64)
    is64 = sys.maxsize > 2 ** 32
    sysroot = os.environ.get("SystemRoot", r"C:\Windows")
    sysdirs = [os.path.join(sysroot, "System32" if is64 else "SysWOW64")]
    for d in sysdirs:
        for name in KNOWN_P11_DLLS:
            p = os.path.join(d, name)
            if os.path.isfile(p) and p.lower() not in seen:
                seen.add(p.lower())
                found.append(p)
    # 2) Glob theo mau ten driver PKCS#11 thuc su trong System32
    #    (tranh bat nham runtime nhu msvcp110.dll)
    EXCLUDE_PREFIX = ("msvc", "vcomp", "vcamp", "vcruntime", "api-ms", "concrt")
    for d in sysdirs:
        for pat in ("*pkcs11*.dll", "*cryptoki*.dll", "*csp11*.dll", "*vcsp11*.dll"):
            for p in glob.glob(os.path.join(d, pat)):
                base = os.path.basename(p).lower()
                if base.startswith(EXCLUDE_PREFIX):
                    continue
                if p.lower() not in seen:
                    seen.add(p.lower())
                    found.append(p)
    # 3) Tim trong Program Files (1 cap thu muc con) cho cac DLL biet truoc
    for d in SEARCH_DIRS[2:]:
        if not os.path.isdir(d):
            continue
        for name in KNOWN_P11_DLLS:
            for p in glob.glob(os.path.join(d, "*", name)) + \
                     glob.glob(os.path.join(d, "*", "*", name)):
                if p.lower() not in seen:
                    seen.add(p.lower())
                    found.append(p)
    return found


def read_token_certs():
    """Doc chung thu tu USB token qua PKCS#11, tra ve du lieu (KHONG in).
    Dung cho agent local phuc vu web. Moi cert tra ve dang base64 DER.
    -> [{driver, label, serial, manufacturer, model, certs:[base64,...]}]
    """
    import base64
    import PyKCS11

    result = []
    for dll in find_pkcs11_dlls():
        pkcs11 = PyKCS11.PyKCS11Lib()
        try:
            pkcs11.load(dll)
        except Exception:
            continue
        try:
            slots = pkcs11.getSlotList(tokenPresent=True)
        except Exception:
            continue
        for slot in slots:
            tok = {"driver": os.path.basename(dll), "label": "", "serial": "",
                   "manufacturer": "", "model": "", "certs": []}
            try:
                ti = pkcs11.getTokenInfo(slot)
                tok["label"] = ti.label.strip()
                tok["serial"] = ti.serialNumber.strip()
                tok["manufacturer"] = ti.manufacturerID.strip()
                tok["model"] = ti.model.strip()
            except Exception:
                pass
            try:
                session = pkcs11.openSession(slot, PyKCS11.CKF_SERIAL_SESSION)
                objs = session.findObjects([(PyKCS11.CKA_CLASS, PyKCS11.CKO_CERTIFICATE)])
                for o in objs:
                    val = session.getAttributeValue(o, [PyKCS11.CKA_VALUE])[0]
                    der = bytes(val)
                    tok["certs"].append(base64.b64encode(der).decode("ascii"))
                session.closeSession()
            except Exception:
                pass
            if tok["certs"]:
                result.append(tok)
    return result


def check_token_pkcs11():
    hr("USB TOKEN (PKCS#11)")
    try:
        import PyKCS11
    except Exception as e:
        print(f"  [Khong co PyKCS11: {e}]")
        return False

    from cryptography import x509

    dlls = find_pkcs11_dlls()
    if not dlls:
        print("  Khong tim thay driver PKCS#11 nao tren may.")
        print("  -> Hay cai phan mem token cua hang (Viettel-CA / VNPT-CA / FPT-CA...),")
        print("     hoac chi ro duong dan .dll: python checkcts.py token <duong_dan.dll>")
        return False

    print(f"  Tim thay {len(dlls)} driver PKCS#11 kha nang:")
    for p in dlls:
        print(f"    - {p}")

    any_token = False
    for dll in dlls:
        pkcs11 = PyKCS11.PyKCS11Lib()
        try:
            pkcs11.load(dll)
        except Exception as e:
            print(f"\n  [Bo qua {os.path.basename(dll)}: khong nap duoc - {e}]")
            continue
        try:
            slots = pkcs11.getSlotList(tokenPresent=True)
        except Exception as e:
            print(f"\n  [Loi liet ke slot voi {os.path.basename(dll)}: {e}]")
            continue
        if not slots:
            continue
        any_token = True
        for slot in slots:
            hr(f"  Driver: {os.path.basename(dll)} | Slot {slot}")
            try:
                ti = pkcs11.getTokenInfo(slot)
                print(f"     Ten token (label) : {ti.label.strip()}")
                print(f"     Nha san xuat      : {ti.manufacturerID.strip()}")
                print(f"     Model             : {ti.model.strip()}")
                print(f"     So serial token   : {ti.serialNumber.strip()}")
            except Exception as e:
                print(f"     [Khong doc TokenInfo: {e}]")
            # Doc chung thu trong token (khong can PIN)
            try:
                session = pkcs11.openSession(slot, PyKCS11.CKF_SERIAL_SESSION)
                certs = session.findObjects(
                    [(PyKCS11.CKA_CLASS, PyKCS11.CKO_CERTIFICATE)]
                )
                print(f"     So chung thu trong token: {len(certs)}")
                for j, obj in enumerate(certs, 1):
                    val = session.getAttributeValue(obj, [PyKCS11.CKA_VALUE])[0]
                    der = bytes(val)
                    try:
                        cert = x509.load_der_x509_certificate(der)
                        print(f"\n     >> Chung thu #{j}:")
                        print_cert(cert, indent="        ")
                    except Exception as e:
                        print(f"     [Khong parse cert #{j}: {e}]")
                session.closeSession()
            except Exception as e:
                print(f"     [Khong doc chung thu: {e}]")
    if not any_token:
        print("\n  Da nap duoc driver nhung KHONG thay token nao dang cam.")
        print("  -> Kiem tra lai USB token da cam chua, hoac cam lai.")
    return any_token


def check_windows_store():
    """Fallback: doc kho chung thu Windows (token thuong tu nap cert vao day)."""
    hr("KHO CHUNG THU WINDOWS (CurrentUser\\My)")
    ps = (
        "Get-ChildItem Cert:\\CurrentUser\\My | "
        "Select-Object Subject,Issuer,SerialNumber,NotBefore,NotAfter,"
        "@{N='HasPrivKey';E={$_.HasPrivateKey}} | Format-List"
    )
    try:
        out = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps],
            capture_output=True, text=True, timeout=30
        )
        txt = (out.stdout or "").strip()
        if txt:
            print(txt)
        else:
            print("  (Khong co chung thu nao trong kho CurrentUser\\My)")
        if out.stderr.strip():
            print("  [stderr]", out.stderr.strip())
    except Exception as e:
        print(f"  [Khong doc duoc kho Windows: {e}]")


# ----------------------------------------------------------------------------
# main
# ----------------------------------------------------------------------------
def default_pdf_in_dir():
    pdfs = glob.glob(os.path.join(os.path.dirname(os.path.abspath(__file__)), "*.pdf"))
    return pdfs[0] if pdfs else None


def main():
    args = sys.argv[1:]
    if not args:
        # Mac dinh: doc PDF trong thu muc + do token + kho Windows
        pdf = default_pdf_in_dir()
        if pdf:
            check_pdf(pdf)
        else:
            print("Khong tim thay file PDF nao trong thu muc.")
        ok = check_token_pkcs11()
        if not ok:
            check_windows_store()
        return

    cmd = args[0].lower()
    if cmd == "file":
        if len(args) < 2:
            print("Thieu duong dan file. Vd: python checkcts.py file \"a.pdf\"")
            return
        check_pdf(args[1])
    elif cmd == "token":
        if len(args) >= 2:
            # Cho phep chi ro .dll
            import PyKCS11
            from cryptography import x509
            global find_pkcs11_dlls
            dll = args[1]
            _orig = find_pkcs11_dlls
            find_pkcs11_dlls = lambda: [dll] if os.path.isfile(dll) else []
            check_token_pkcs11()
            find_pkcs11_dlls = _orig
        else:
            ok = check_token_pkcs11()
            if not ok:
                check_windows_store()
    else:
        # Coi nhu duong dan file PDF
        check_pdf(args[0])


if __name__ == "__main__":
    main()
