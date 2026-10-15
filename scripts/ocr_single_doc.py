# -*- coding: utf-8 -*-
"""
Script OCR độc lập cho 1 file PDF scan bất kỳ sử dụng Tesseract và fitz
"""

import os
import sys
import subprocess
import fitz
from multiprocessing import Pool

TMP_DIR = 'scratch/ocr_tmp'
os.makedirs(TMP_DIR, exist_ok=True)

def ocr_worker(args):
    pdf_path, p_idx, dpi = args
    img_path = os.path.join(TMP_DIR, f"page_{p_idx}.png")
    
    doc = fitz.open(pdf_path)
    page = doc[p_idx]
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
        text = f"[LỖI TRANG {p_idx+1}: {e}]"
    finally:
        if os.path.exists(img_path):
            try:
                os.remove(img_path)
            except:
                pass

    return p_idx, text

def run_ocr(pdf_path, output_txt, dpi=180, workers=8):
    if not os.path.exists(pdf_path):
        print(f"Không tìm thấy: {pdf_path}")
        return

    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    doc.close()
    print(f"-> Đang chạy OCR {total_pages} trang của: {pdf_path} (workers={workers})...")

    tasks = [(pdf_path, i, dpi) for i in range(total_pages)]
    with Pool(workers) as pool:
        results = pool.map(ocr_worker, tasks)

    results.sort(key=lambda x: x[0])
    full_text = '\n\n'.join([f"--- TRANG {r[0]+1} ---\n{r[1]}" for r in results])

    os.makedirs(os.path.dirname(output_txt), exist_ok=True)
    with open(output_txt, 'w', encoding='utf-8') as f:
        f.write(full_text)

    print(f"✅ Đã lưu OCR thành công: {output_txt} ({len(full_text)} ký tự)")

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python3 scripts/ocr_single_doc.py <pdf_path> <output_txt>")
        sys.exit(1)
    run_ocr(sys.argv[1], sys.argv[2])
