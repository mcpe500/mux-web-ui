## graphify (WAJIB — gunakan secara MAKSIMAL)

Project ini punya knowledge graph di graphify-out/ dengan god nodes, community structure, dan cross-file relationships.

Ketika user mengetik `/graphify`, gunakan skill/instruksi graphify yang terpasang sebelum melakukan hal lain.

Aturan WAJIB:

1. **Graph dulu, grep belakangan.** Untuk SETIAP pertanyaan/task tentang codebase, jalankan `graphify query "<question>"` lebih dulu ketika `graphify-out/graph.json` ada. Perluas kosakata pertanyaan terhadap node di graph (lihat `references/query.md` di skill). Variasi: `--dfs` untuk menelusuri jalur spesifik, `--budget N` untuk membatasi token jawaban, `context_filter=[...]` untuk menyaring tipe node. Pakai `graphify path "<A>" "<B>"` (tambah `--undirected` bila perlu) untuk relasi antar dua konsep, dan `graphify explain "<concept>"` untuk satu node. Hasilnya adalah subgraph terfokus — lebih kecil dan lebih relevan daripada GRAPH_REPORT.md atau raw grep.

2. **Kutip sumber.** Saat menjawab dari graph, kutip `source_location` (path + line) agar bisa diverifikasi.

3. **Gunakan wiki bila ada.** Jika `graphify-out/wiki/index.md` ada, pakai untuk navigasi luas sebelum browsing source mentah.

4. **GRAPH_REPORT.md hanya untuk review arsitektur luas** atau ketika query/path/explain tidak memunculkan konteks yang cukup.

5. **Jangan skip graphify karena graphify-out/ dirty.** File kotor di graphify-out/ adalah hal wajar setelah hook/update inkremental; graph file kotor bukan alasan untuk melewati graphify. Hanya skip bila: task tentang output graph yang basi/salah, atau user eksplisit meminta tanpa graphify.

6. **Sinkronkan graph setelah modif.** Setelah mengubah kode, jalankan `graphify update .` (AST-only, tanpa biaya API). Untuk perubahan docs/spec yang substansial, jalankan `/graphify --update` (semantic) di session yang sama atau berikutnya.

7. **Rule of thumb:** graphify dulu selalu; grep/glob/read hanya pelengkap untuk detail baris yang graph tidak tampilkan (misal membaca file penuh sebelum edit).
