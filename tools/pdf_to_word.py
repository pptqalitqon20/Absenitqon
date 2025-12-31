import sys
from pdf2docx import Converter

if len(sys.argv) < 3:
    print("Usage: pdf_to_word.py input.pdf output.docx")
    sys.exit(1)

pdf_path = sys.argv[1]
docx_path = sys.argv[2]

cv = Converter(pdf_path)
cv.convert(docx_path)
cv.close()
