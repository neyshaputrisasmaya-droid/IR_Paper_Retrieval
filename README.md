# Academic Paper Retrieval

Mesin pencari artikel ilmiah berbasis judul dan abstrak, dengan dua model:
**Boolean Retrieval** dan **Vector Space Model (TF-IDF + Cosine Similarity)**.
Proyek UAS Sistem Temu Kembali Informasi.

## Dataset

- **Sumber:** subset 100 dokumen dari DBLP Citation Network Dataset (AMiner).
- **Kolom asli:** `id`, `title`, `abstract`, `authors`, `venue`, `year`, `n_citation`, `references`.
- **Karakteristik:** 100 paper ilmu komputer (1980–2015) dari 84 venue berbeda, rata-rata sekitar 150 kata per dokumen, semuanya berbahasa Inggris.
- **Teks yang diindeks:** judul + abstrak (`document_text`). Document ID = nomor baris (0–99).
- File: `dataset/prepared_dataset.csv` (data asli + kolom hasil setiap tahap preprocessing).

## Instalasi

Butuh Python 3.12.

```bash
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Linux / macOS
pip install -r requirements.txt
```

## Menjalankan

```bash
python app.py
```

Lalu buka http://127.0.0.1:5000. Tampilan berbentuk dashboard dengan menu di sidebar kiri (di layar kecil menjadi bar atas):

| Menu | Isi |
|---|---|
| Ringkasan | Halaman pembuka: angka kunci (dokumen, term unik, query uji, P@5, MAP), grafik VSM vs Boolean, grafik P@5 per query, pencarian cepat, dan cara kerja 4 langkah |
| Pencarian | Input query, pilihan metode (VSM / Boolean / **Bandingkan keduanya** berdampingan), Top-5/Top-10. Query ditampilkan setelah diproses (kata umum dicoret, kata diubah ke bentuk dasar). Hasil menampilkan peringkat, skor dalam persen, dan **kata yang cocok ditebalkan** di judul dan abstrak. **Evaluasi langsung**: centang "Relevan", lalu P@5, P@10, AP, RR (dan Recall jika jumlah relevan diisi) dihitung seketika. Cocok untuk query baru dari dosen saat demo |
| Dataset & Preprocessing | Sumber dan statistik dataset, pengaruh setiap tahap preprocessing, contoh dokumen sebelum dan setelah diproses (stopword dicoret, perubahan kata dasar ditandai), dan hasil lengkap setiap tahap |
| Perhitungan VSM | Rincian TF, df, IDF, bobot TF-IDF, dot product, panjang vektor dan cosine untuk query dan 3 dokumen teratas, dengan penjelasan bahasa sederhana (validasi perhitungan manual) |
| Evaluasi | Kesimpulan, P@5, P@10, R@10, MAP, MRR, Precision/Recall/F1 Boolean (masing-masing dengan kalimat penjelas), alasan perbedaan kedua model, hasil per query, analisis dokumen relevan dan tidak relevan. **Kelola query uji** (tambah, edit, hapus; tersimpan ke `evaluation/queries.json`) |
| Tentang Model | Penjelasan Boolean (dengan analogi dan keterbatasannya), VSM, ranking, tie-breaking, dan preprocessing |

Setiap istilah teknis memiliki ikon **(?)** yang menampilkan penjelasan singkat saat diarahkan mouse atau difokus dengan keyboard.

## Perintah lain

```bash
python preprocess_dataset.py 0 9    # jalankan ulang seluruh preprocessing, tampilkan contoh dokumen 0 dan 9
python -m backend.evaluation        # tabel evaluasi di terminal
python -m unittest discover tests   # unit test
```

`preprocess_dataset.py` membuat ulang kolom preprocessing di `prepared_dataset.csv` dari teks asli.
Jalankan perintah ini setiap kali `backend/preprocessing.py` diubah.

## Contoh Query

| Metode | Query |
|---|---|
| VSM | `image retrieval`, `speech recognition`, `wireless network`, `fuzzy logic`, `control system stability` |
| Boolean | `image AND retrieval`, `speech OR speaker`, `wireless AND network`, `(image OR video) AND NOT retrieval`, `test AND (software OR system)` |

Daftar lengkap 10 query uji beserta dokumen relevannya ada di `evaluation/queries.json`.

## Struktur

```
app.py                       Flask: routing dan validasi input API
backend/dataset.py           memuat dataset sekali, statistik, detail dokumen
backend/preprocessing.py     case folding, tokenization, stopword removal, stemming, normalisasi
backend/boolean_retrieval.py inverted index + parser AND/OR/NOT/kurung
backend/vector_space.py      TF, IDF, TF-IDF, cosine similarity, ranking, perhitungan manual
backend/evaluation.py        P@k, R@k, AP/MAP, MRR, Precision/Recall/F1, kelola query uji
preprocess_dataset.py        pipeline preprocessing dataset
evaluation/queries.json      query uji + relevance judgment
templates/index.html         halaman web
static/js/main.js            titik masuk; modul per menu: overview, search, dataset, explain, evaluation
static/js/charts.js          grafik batang sederhana (HTML/CSS, tanpa library)
static/js/common.js          utilitas bersama: API, glosarium istilah, penanda kata, tab
static/css/style.css         tampilan
tests/                       unit test
```

## Detail Implementasi

- **Preprocessing:** huruf kecil → buang kalimat hak cipta penerbit dan karakter selain huruf, pecah per kata → buang stopword bahasa Inggris (NLTK) kecuali *no/not/nor* → Porter stemming → buang token 1 huruf. Dokumen dan query memakai fungsi yang sama (`preprocess_steps`).
- **Boolean:** operasi himpunan pada inverted index. Prioritas operator: kurung > NOT > AND > OR. Dua term tanpa operator dianggap AND.
- **VSM:** TF = frekuensi mentah, IDF = ln(N/df), bobot = TF × IDF, kemiripan = cosine similarity.
- **Ranking:** skor diurutkan dari tertinggi. Tie-breaking: skor sama diurutkan berdasarkan Document ID terkecil.

## API

| Endpoint | Keterangan |
|---|---|
| `POST /search` | `{"query", "method": "vsm"/"boolean", "top_k": 5/10}` |
| `GET /api/dataset` | statistik dataset dan preprocessing |
| `GET /api/document/<id>` | detail dokumen dan hasil setiap tahap preprocessing |
| `POST /api/explain` | `{"query"}`: rincian perhitungan VSM |
| `GET /api/evaluation` | hasil evaluasi seluruh query uji |
| `POST /api/metrics` | `{"ranked": [id, ...], "relevant": [id, ...], "total_relevant"}`: metrik untuk hasil yang dinilai langsung |
| `GET /api/queries` | daftar query uji |
| `POST /api/queries` | tambah query uji `{"query", "boolean_query", "information_need", "relevant": [id, ...]}` |
| `PUT /api/queries/<id>` | ubah query uji |
| `DELETE /api/queries/<id>` | hapus query uji |

## Library

Flask (web), pandas (pengolahan data), NLTK (stopword list dan Porter Stemmer).
Pembobotan TF-IDF, cosine similarity, Boolean retrieval, dan metrik evaluasi diimplementasikan sendiri tanpa library IR.
