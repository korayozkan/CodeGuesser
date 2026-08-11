# { } CodeGuesser

> Tek satırlık kod parçasına bakarak programlama dilini tahmin et, zirveye çık.

![HTML](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat&logo=supabase&logoColor=white)

---

## Özellikler

| Özellik | Detay |
|---|---|
| 🔐 Kimlik Doğrulama | GitHub ve Google OAuth (Supabase Auth) |
| 🎮 Oyun Döngüsü | 15 saniyelik süre, 3 can, giderek artan zorluk |
| 🔥 Seri & Bonus | Her 5 doğruda 3× puanlı bonus soru |
| 🃏 Jokerler | 50/50, Freeze (5s dondur), Skip (pas geç) |
| ⚔️ 1v1 Düello | Link ile arkadaşını davet et, Realtime senkronizasyon |
| 🏆 Lider Tablosu | Supabase Realtime ile canlı sıralama bildirimleri |
| 🛒 Mağaza | Avatar çerçeveleri, temalar, doğru cevap efektleri |
| 🎨 Temalar | VS Code Dark · Matrix · Cyberpunk |
| 🎁 Günlük Ödül | Her 24 saatte bir ücretsiz joker |
| 🏅 Unvan Sistemi | Çaylak → Stajyer → ... → Code Wizard 🧙 |

---

## Proje Yapısı

```
codeguesser/
├── index.html                   # SPA iskelet — tüm ekranlar tek sayfada
├── css/
│   ├── main.css                 # Layout, buton, modal, toast stilleri
│   └── themes.css               # VS Code Dark / Matrix / Cyberpunk
├── js/
│   ├── main.js                  # Entry point — tüm init çağrıları
│   ├── config.js                # Supabase client, oyun sabitleri, mağaza kataloğu
│   ├── auth.js                  # GitHub / Google OAuth, profil yükleme, ekran yönetimi
│   ├── ui-utils.js              # Toast, efekt, shuffle ve modal yardımcıları
│   ├── questions.js             # Soru çekme, zorluk artış algoritması, LCG seed
│   ├── game.js                  # Zamanlayıcı, can, puan, streak, Supabase kayıt
│   ├── jokers.js                # 50/50 / Freeze / Skip mekaniği
│   ├── leaderboard.js           # Realtime sıralama, podyum, sıra değişim bildirimleri
│   ├── store.js                 # Mağaza, kozmetik/tema satın alma, günlük ödül
│   └── duel.js                  # 1v1 Realtime düello, seed tabanlı senkronizasyon
└── supabase/migrations/
    ├── 001_initial_schema.sql   # Tablolar, tetikleyiciler, indeksler
    ├── 002_rls_policies.sql     # Row Level Security politikaları
    └── 003_seed_questions.sql   # 40 soru, 5 zorluk seviyesi
```

---

## Kurulum

### 1. Repoyu klonla

```bash
git clone https://github.com/KULLANICI_ADIN/codeguesser.git
cd codeguesser
```

### 2. Supabase projesi oluştur

1. [supabase.com](https://supabase.com) adresine giderek yeni bir proje oluştur.
2. **SQL Editor**'dan migration dosyalarını sırayla çalıştır:

```
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_rls_policies.sql
supabase/migrations/003_seed_questions.sql
```

### 3. OAuth sağlayıcılarını etkinleştir

Supabase Dashboard → **Authentication → Providers** bölümünden:

- **GitHub**: GitHub OAuth App oluştur, Client ID ve Secret gir.
- **Google**: Google Cloud Console'dan OAuth 2.0 Client ID oluştur.

Her iki sağlayıcı için callback URL:
```
https://<PROJE_REF>.supabase.co/auth/v1/callback
```

### 4. Realtime tablolarını etkinleştir

Supabase Dashboard → **Database → Replication** bölümünden şu tabloları Realtime için işaretle:
- `leaderboard`
- `duels`

### 5. Yapılandırma dosyasını doldur

`js/config.js` dosyasını aç ve kendi Supabase bilgilerinle doldur:

```js
export const SUPABASE_URL      = 'https://PROJE_REF.supabase.co';
export const SUPABASE_ANON_KEY = 'ANON_KEY_BURAYA';
```

> ⚠️ `SERVICE_ROLE` anahtarını asla bu dosyaya ekleme.

### 6. Projeyi çalıştır

Framework veya build adımı yok. Doğrudan bir HTTP sunucusu yeterli:

```bash
# npx ile (Node kurulu olması gerekir)
npx serve .

# Python ile
python -m http.server 8080

# VS Code Live Server eklentisi ile
# index.html → sağ tık → "Open with Live Server"
```

> `file://` protokolü ES Modules nedeniyle çalışmaz, mutlaka HTTP sunucusu kullan.

---

## Teknik Mimari

### Güvenlik Kararları

| Kural | Neden |
|---|---|
| Skor / can / joker localStorage'da saklanmaz | Hile engellemek için — tüm kritik veriler Supabase DB'de |
| Tema tercihi localStorage'da saklanır | Güvenlik riski yok, sayfa yüklenirken hızlı okuma için |
| RLS tüm tablolarda aktif | Her kullanıcı yalnızca kendi verisini yazabilir |
| Anon key istemcide kullanılır | Tasarım gereği güvenli (RLS devrede olduğu sürece) |

### Düello Senkronizasyonu

İki oyuncu aynı soruları görmek için **LCG (Linear Congruential Generator)** tabanlı deterministik karıştırma kullanır. Oda oluşturulurken rastgele bir `seed` üretilir, her iki oyuncu bu seed ile birebir aynı soru sırasını alır. Supabase Realtime üzerinden skorlar canlı aktarılır.

### Tema Sistemi

Temalar CSS Custom Properties (değişkenler) üzerinden çalışır. `<body>` sınıfı değiştiğinde (`theme-vscode-dark`, `theme-matrix`, `theme-cyberpunk`) tüm renk paleti anında güncellenir — JavaScript ile tek tek element renklendirmesi yapılmaz.

---

## Katkıda Bulunma

1. Fork'la
2. Feature branch oluştur: `git checkout -b feature/yeni-ozellik`
3. Değişikliklerini commit'le: `git commit -m "feat: yeni özellik açıklaması"`
4. Branch'ini push'la: `git push origin feature/yeni-ozellik`
5. Pull Request aç

---

## Lisans

MIT © 2026
