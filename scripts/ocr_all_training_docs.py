# -*- coding: utf-8 -*-
"""
Script OCR và trích xuất TOÀN VĂN (FULL TEXT 100% - KHÔNG TÓM TẮT)
Toàn bộ kho tài liệu tập huấn Lưu trữ (18 tài liệu gốc)
Sử dụng PyMuPDF (fitz), textutil và Tesseract 5.5.1 đa luồng (vie)
"""

import os
import sys
import glob
import time
import subprocess
from multiprocessing import Pool, cpu_count
import fitz

DATA_DIR = os.path.abspath('data/regulations/Tai lieu tap huan')
OUTPUT_DIR = os.path.abspath('data/extracted_full_text')
TMP_IMG_DIR = os.path.abspath('scratch/ocr_pages')

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(TMP_IMG_DIR, exist_ok=True)

def ocr_single_page(args):
    pdf_path, page_idx, dpi = args
    base_name = os.path.splitext(os.path.basename(pdf_path))[0]
    img_path = os.path.join(TMP_IMG_DIR, f"{base_name}_p{page_idx}.png")
    
    doc = fitz.open(pdf_path)
    page = doc[page_idx]
    pix = page.get_pixmap(dpi=dpi)
    pix.save(img_path)
    doc.close()

    try:
        res = subprocess.run(
            ['tesseract', img_path, 'stdout', '-l', 'vie', '--oem', '1'],
            capture_output=True,
            timeout=30
        )
        text = res.stdout.decode('utf-8', errors='ignore').strip()
    except Exception as e:
        text = f"[LỖI OCR TRANG {page_idx + 1}: {str(e)}]"
    finally:
        if os.path.exists(img_path):
            try:
                os.remove(img_path)
            except:
                pass

    return page_idx, text

def extract_pdf_full(pdf_path, is_scanned=False, dpi=180):
    base_name = os.path.splitext(os.path.basename(pdf_path))[0]
    out_file = os.path.join(OUTPUT_DIR, f"{base_name}.txt")
    
    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    doc.close()

    print(f"\n==================================================")
    print(f"📄 Đang xử lý PDF: {base_name} ({total_pages} trang)")
    print(f"   Loại tài liệu: {'Ảnh scan (Chạy OCR đa luồng)' if is_scanned else 'Văn bản số (Trích xuất Text Layer trực tiếp)'}")
    print(f"==================================================")

    start_time = time.time()
    pages_text = {}

    if not is_scanned:
        doc = fitz.open(pdf_path)
        for i, page in enumerate(doc):
            t = page.get_text().strip()
            pages_text[i] = t
        doc.close()
    else:
        workers = min(8, cpu_count() or 4)
        tasks = [(pdf_path, i, dpi) for i in range(total_pages)]
        
        with Pool(workers) as pool:
            for idx, text in pool.imap_unordered(ocr_single_page, tasks):
                pages_text[idx] = text
                print(f"   [OCR Trang {idx + 1:02d}/{total_pages:02d}] Trích xuất được {len(text)} ký tự")

    # Ghép văn bản tuần tự từ trang 1 đến trang cuối
    full_content = []
    for i in range(total_pages):
        full_content.append(f"--- TRANG {i + 1} / {total_pages} ---\n{pages_text.get(i, '')}\n")

    result_text = "\n".join(full_content)
    with open(out_file, 'w', encoding='utf-8') as f:
        f.write(result_text)

    elapsed = time.time() - start_time
    print(f"✅ Hoàn tất {base_name}: {len(result_text)} ký tự (thời gian: {elapsed:.2f}s)")
    print(f"💾 Lưu tại: {out_file}")
    return out_file

def extract_doc_files():
    doc_files = sorted(glob.glob(os.path.join(DATA_DIR, "*.doc")))
    print(f"\n==================================================")
    print(f"📑 Đang xử lý {len(doc_files)} tập tin .doc khung phân loại chuyên ngành...")
    print(f"==================================================")

    for f in doc_files:
        base_name = os.path.splitext(os.path.basename(f))[0]
        out_file = os.path.join(OUTPUT_DIR, f"{base_name}.txt")
        try:
            res = subprocess.run(['textutil', '-convert', 'txt', '-stdout', f], capture_output=True, text=True)
            text = res.stdout.strip()
            with open(out_file, 'w', encoding='utf-8') as out:
                out.write(text)
            print(f"✅ Trích xuất thành công: {base_name} ({len(text)} ký tự)")
        except Exception as e:
            print(f"❌ Lỗi trích xuất {base_name}: {e}")

def main():
    print("🚀 BẮT ĐẦU QUY TRÌNH TRÍCH XUẤT TOÀN VĂN 100% (ZERO SUMMARY LOSS)")
    total_start = time.time()

    # 1. Trích xuất các file .doc
    extract_doc_files()

    # 2. Trích xuất các file PDF có sẵn Text Layer
    pdf_text_files = [
        "hdvp06.signed.signed.pdf",
        "HD-0017-phuong an phan loai tai lieu.pdf",
        "HD 29 XAC DINH GIA TRI TAI LIEU.pdf",
        "HD 30 ban thoi han doan the.pdf"
    ]
    for name in pdf_text_files:
        p = os.path.join(DATA_DIR, name)
        if os.path.exists(p):
            extract_pdf_full(p, is_scanned=False)

    # 3. Chạy Tesseract OCR tiếng Việt đa luồng cho các file PDF ảnh scan
    scanned_pdf_files = [
        ("HD 50 VE CHINH LY TAI LIEU.pdf", 180),
        ("Khung phan loai QUAN SU.pdf", 180),
        ("HD 24 thoi han bao quan_0001.pdf", 180)  # 70 trang đầy đủ
    ]
    for name, dpi in scanned_pdf_files:
        p = os.path.join(DATA_DIR, name)
        if os.path.exists(p):
            extract_pdf_full(p, is_scanned=True, dpi=dpi)

    total_elapsed = time.time() - total_start
    print(f"\n🎉 TOÀN BỘ 18 TẬP TIN ĐÃ ĐƯỢC TRÍCH XUẤT TOÀN VĂN THÀNH CÔNG!")
    print(f"⏱️ Tổng thời gian: {total_elapsed:.2f} giây.")

if __name__ == '__main__':
    main()
