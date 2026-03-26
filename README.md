# Laporan Penugasan Modul 1
## Open Recruitment NETICS 2026

**Nama:** Palpal Yalmialam  
**NRP:** 5025241002  
**GitHub Repo:** https://github.com/palpalyt/oprecneticsmodule1  
**Docker Image:** https://hub.docker.com/r/palpalyt/neticsmodul1  
**URL API:** http://70.153.144.111/health  

---

## Deskripsi Problem

Di penugasan modul 1 ini, kita diminta untuk mengimplementasikan sebuah sistem CI/CD (Continuous Integration / Continuous Deployment) yang lengkap dari nol. Artinya, setiap kali ada perubahan kode yang di-push ke GitHub, sistem akan secara otomatis melakukan build Docker image, push ke registry, lalu deploy ke server — tanpa harus manual masuk ke server dan ketik command satu per satu.

Selain itu, konfigurasi Nginx sebagai reverse proxy juga harus dilakukan secara otomatis menggunakan Ansible, bukan manual. Jadi idealnya, kalau ada orang lain yang mau setup ulang server dari awal, cukup jalankan satu Ansible Playbook dan semuanya langsung terkonfigurasi.

Untuk proyek ini, teknologi yang saya gunakan adalah:
- **Node.js + Express.js** untuk membuat API
- **Docker** (multi-stage build) untuk containerization
- **Microsoft Azure** sebagai VPS
- **GitHub Actions** sebagai platform CI/CD
- **Ansible** untuk otomasi instalasi dan konfigurasi Nginx
- **Docker Hub** sebagai container registry

---

## Infrastruktur Sistem

Secara garis besar, alur request dari internet ke API kita adalah seperti ini:

```
Internet → Nginx (port 80) → Docker Container / API (port 8080)
                ↑
          VPS Azure (Ubuntu 24.04)
                ↑
    Auto-deployed via GitHub Actions
```

Nginx berperan sebagai "pintu depan" — ia menerima semua request dari internet di port 80, lalu meneruskannya ke API kita yang berjalan di dalam Docker container di port 8080. Kenapa tidak langsung expose port 8080 ke publik? Karena dengan Nginx sebagai reverse proxy, kita dapat keamanan ekstra, bisa tambahkan SSL nantinya, dan bisa lebih mudah manage multiple service di satu server.

---

## Struktur Repositori

```
.
├── .github/
│   └── workflows/
│       ├── ci.yml        # CI Pipeline - build & push Docker image
│       └── cd.yml        # CD Pipeline - deploy ke VPS via Ansible
├── ansible/
│   ├── playbook.yml      # Ansible playbook untuk install & konfigurasi Nginx
│   └── nginx.conf.j2     # Template konfigurasi Nginx (Jinja2)
├── Dockerfile            # Multi-stage Dockerfile
├── server.js             # Source code API
└── package.json          # Dependencies Node.js
```

---

## Penjelasan Pengerjaan

### 1. Pembuatan API

Langkah pertama adalah membuat API sederhana yang nanti akan kita deploy. Saya menggunakan **Node.js** dengan framework **Express.js** karena mudah digunakan dan sangat umum untuk pembuatan REST API.

API ini hanya punya satu endpoint utama yaitu `GET /health` yang mengembalikan informasi berupa JSON. Berikut adalah kode lengkapnya:

```javascript
const express = require('express');
const app = express();
const PORT = 8080;

app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({
    nama: "Palpal Yalmialam",
    nrp: "5025241002",
    status: "UP",
    timestamp: Date.now(),
    uptime: process.uptime()
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
```

Penjelasan kode:
- `express.json()` digunakan agar server bisa menerima request body dalam format JSON
- `app.get('/health', ...)` mendefinisikan endpoint GET pada path `/health`
- `Date.now()` mengembalikan timestamp saat ini dalam milidetik (Unix timestamp)
- `process.uptime()` mengembalikan berapa lama server sudah berjalan dalam detik
- `app.listen(PORT, '0.0.0.0', ...)` membuat server berjalan di port 8080 dan menerima koneksi dari semua IP address (bukan hanya localhost), ini penting agar bisa diakses dari luar container Docker

Contoh response dari endpoint `/health`:

```json
{
  "nama": "Palpal Yalmialam",
  "nrp": "5025241002",
  "status": "UP",
  "timestamp": 1774444106555,
  "uptime": 9.686
}
```

---

### 2. Containerization dengan Docker (Multi-stage Build)

Setelah API selesai, langkah berikutnya adalah membungkus API ini ke dalam Docker container. Tujuannya agar API bisa berjalan di environment mana saja secara konsisten — tidak peduli OS-nya apa, selama ada Docker, pasti bisa jalan.

Saya menggunakan **multi-stage build** pada Dockerfile. Konsepnya adalah kita pisahkan proses "build/install dependencies" dengan "running the app". Hasilnya adalah Docker image yang lebih kecil dan bersih karena tidak membawa file-file yang tidak diperlukan saat production.

```dockerfile
# Stage 1: Builder - install semua dependencies
FROM node:18-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --omit=dev

# Stage 2: Production - hanya ambil yang perlu saja
FROM node:18-alpine
WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY . .
EXPOSE 8080
CMD ["node", "server.js"]
```

Penjelasan:
- `FROM node:18-alpine` menggunakan base image Node.js versi 18 yang berbasis Alpine Linux (sangat ringan, hanya ~5MB)
- `Stage 1 (builder)`: hanya menginstall dependencies via `npm ci --omit=dev` (clean install tanpa dev dependencies)
- `Stage 2 (production)`: mengcopy hasil node_modules dari stage 1, lalu copy source code, dan jalankan server
- `EXPOSE 8080` mendokumentasikan bahwa container ini mendengarkan di port 8080
- `CMD ["node", "server.js"]` adalah command yang dijalankan saat container start

---

### 3. Setup VPS di Microsoft Azure

Untuk hosting API, saya menggunakan **Microsoft Azure**.

Setelah VM dibuat, saya menginstall Docker di server menggunakan official Docker installation script untuk Ubuntu. Ini adalah langkah satu kali yang diperlukan agar server bisa menjalankan container Docker ketika CI/CD pipeline berjalan.

Port yang dibuka di firewall Azure:
- **Port 22** (SSH) — untuk remote access
- **Port 80** (HTTP) — untuk Nginx
- **Port 8080** — untuk API Docker container

---

### 4. Konfigurasi Nginx dengan Ansible

Salah satu requirement penting di penugasan ini adalah konfigurasi Nginx harus dilakukan **secara otomatis menggunakan Ansible**, bukan manual. Ansible adalah tool Infrastructure as Code (IaC) yang memungkinkan kita mendefinisikan konfigurasi server dalam file YAML, lalu menjalankannya secara otomatis.

**`ansible/playbook.yml`** — berisi instruksi untuk Ansible:

```yaml
---
- name: Setup Nginx as reverse proxy
  hosts: vps
  become: yes
  tasks:
    - name: Install nginx
      apt:
        name: nginx
        state: present
        update_cache: yes

    - name: Copy nginx config
      template:
        src: nginx.conf.j2
        dest: /etc/nginx/sites-available/default

    - name: Remove default symlink
      file:
        path: /etc/nginx/sites-enabled/default
        state: absent

    - name: Create symlink
      file:
        src: /etc/nginx/sites-available/default
        dest: /etc/nginx/sites-enabled/default
        state: link

    - name: Restart nginx
      service:
        name: nginx
        state: restarted
        enabled: yes
```

Penjelasan playbook:
- `become: yes` artinya jalankan dengan privilege sudo
- Task pertama menginstall Nginx via apt (package manager Ubuntu)
- Task kedua meng-copy template konfigurasi Nginx dari file `.j2` ke server
- Task ketiga dan keempat mengaktifkan konfigurasi dengan membuat symlink
- Task terakhir merestart Nginx agar konfigurasi baru diterapkan

**`ansible/nginx.conf.j2`** — template konfigurasi Nginx:

```nginx
server {
    listen 80;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Konfigurasi ini membuat Nginx mendengarkan di port 80 dan meneruskan semua request ke `localhost:8080` (di mana Docker container API kita berjalan). Header tambahan seperti `X-Real-IP` diteruskan agar API bisa mengetahui IP asli dari client yang melakukan request.

---

### 5. CI/CD Pipeline dengan GitHub Actions

Ini adalah bagian inti dari penugasan. Pipeline dibagi menjadi dua workflow terpisah: **CI Pipeline** dan **CD Pipeline**.

#### CI Pipeline (`.github/workflows/ci.yml`)

CI Pipeline berjalan setiap kali ada push atau pull request ke branch `main`. Tugasnya adalah memastikan kode yang baru di-push bisa di-build menjadi Docker image dengan benar, lalu push image tersebut ke Docker Hub.

```yaml
name: CI Pipeline

on:
  push:
    branches: [ "main" ]
  pull_request:
    branches: [ "main" ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Login to Docker Hub
        env:
          DOCKER_USERNAME: ${{ secrets.DOCKER_USERNAME }}
          DOCKER_PASSWORD: ${{ secrets.DOCKER_PASSWORD }}
        run: docker login -u $DOCKER_USERNAME -p $DOCKER_PASSWORD

      - name: Build Docker image
        run: docker build -t ${{ secrets.DOCKER_USERNAME }}/neticsmodul1:latest .

      - name: Push to Docker Hub
        run: docker push ${{ secrets.DOCKER_USERNAME }}/neticsmodul1:latest
```

Penjelasan alur CI:
1. **Checkout** — GitHub Actions mengambil kode terbaru dari repository
2. **Login Docker Hub** — menggunakan credentials yang disimpan di GitHub Secrets (bukan hardcode di kode) untuk keamanan
3. **Build** — membangun Docker image dari Dockerfile yang ada di repository
4. **Push** — mengirim image yang sudah di-build ke Docker Hub dengan tag `latest`

Penggunaan **GitHub Secrets** (`secrets.DOCKER_USERNAME`, `secrets.DOCKER_PASSWORD`) adalah best practice penting — kita tidak pernah menuliskan password langsung di dalam kode yang bisa dilihat publik.

#### CD Pipeline (`.github/workflows/cd.yml`)

CD Pipeline berjalan secara otomatis **setelah CI Pipeline berhasil**. Tugasnya adalah men-deploy image terbaru ke VPS dan memastikan Nginx terkonfigurasi dengan benar via Ansible.

```yaml
name: CD Pipeline

on:
  workflow_run:
    workflows: ["CI Pipeline"]
    types:
      - completed

jobs:
  deploy:
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    steps:
      - uses: actions/checkout@v4

      - name: Setup SSH key
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.VPS_KEY }}" > ~/.ssh/id_rsa
          chmod 600 ~/.ssh/id_rsa
          ssh-keyscan -H ${{ secrets.VPS_HOST }} >> ~/.ssh/known_hosts

      - name: Install Ansible
        run: pip3 install ansible

      - name: Run Ansible playbook
        run: |
          echo "[vps]" > inventory.ini
          echo "${{ secrets.VPS_HOST }} ansible_user=${{ secrets.VPS_USER }} ansible_ssh_private_key_file=~/.ssh/id_rsa" >> inventory.ini
          ansible-playbook -i inventory.ini ansible/playbook.yml

      - name: Deploy Docker container
        run: |
          ssh -i ~/.ssh/id_rsa ${{ secrets.VPS_USER }}@${{ secrets.VPS_HOST }} "
            docker pull ${{ secrets.DOCKER_USERNAME }}/neticsmodul1:latest
            docker rm -f neticsmodul1 || true
            docker run -d -p 8080:8080 --name neticsmodul1 --restart always ${{ secrets.DOCKER_USERNAME }}/neticsmodul1:latest
          "
```

Penjelasan alur CD:
1. **Trigger** — hanya berjalan jika CI Pipeline selesai dengan status `success`
2. **Setup SSH** — menyiapkan SSH key dari GitHub Secrets agar bisa masuk ke VPS tanpa password. `chmod 600` diperlukan agar key tidak dianggap "terlalu terbuka" oleh SSH
3. **Install Ansible** — menginstall Ansible di runner GitHub Actions
4. **Run Ansible Playbook** — membuat inventory file sementara lalu menjalankan playbook untuk install dan konfigurasi Nginx di VPS
5. **Deploy Container** — SSH ke VPS, pull image terbaru dari Docker Hub, hapus container lama, lalu jalankan container baru dengan flag `--restart always` agar container otomatis restart jika server reboot

---

## Cara Menjalankan

### Prerequisites
Pastikan sudah terinstall:
- [Node.js](https://nodejs.org/) v18+
- [Docker](https://www.docker.com/)
- [Ansible](https://www.ansible.com/)
- Akses SSH ke VPS

---

### 1. Menjalankan API Secara Lokal
```bash
# Clone repository
git clone https://github.com/palpalyt/oprecneticsmodule1.git
cd oprecneticsmodule1

# Install dependencies
npm install

# Jalankan server
node server.js

# API dapat diakses di http://localhost:8080/health
```

---

### 2. Menjalankan dengan Docker Secara Lokal
```bash
# Build Docker image
docker build -t neticsmodul1 .

# Jalankan container
docker run -d -p 8080:8080 --name neticsmodul1 neticsmodul1

# API dapat diakses di http://localhost:8080/health

# Untuk stop container
docker stop neticsmodul1
docker rm neticsmodul1
```

---

### 3. Menjalankan Ansible Playbook (Setup Nginx di VPS)
```bash
# Install Ansible
pip3 install ansible

# Buat file inventory.ini
echo "[vps]" > inventory.ini
echo "70.153.144.111 ansible_user=azureuser ansible_ssh_private_key_file=~/.ssh/netics-key.pem" >> inventory.ini

# Jalankan playbook
ansible-playbook -i inventory.ini ansible/playbook.yml
```

---

### 4. CI/CD Otomatis via GitHub Actions
```bash
# Cukup push ke branch main, pipeline akan berjalan otomatis
git add .
git commit -m "your commit message"
git push origin main

# CI Pipeline  → build & push Docker image ke Docker Hub
# CD Pipeline  → deploy ke VPS & konfigurasi Nginx via Ansible
```

---

## Hasil

Setelah semua konfigurasi selesai, setiap kali kita push kode ke branch `main`:

1. CI Pipeline otomatis jalan → build Docker image → push ke Docker Hub
2. CD Pipeline otomatis jalan → setup Nginx via Ansible → deploy container baru ke VPS
3. API dapat diakses di `http://70.153.144.111/health`

### API Test

Hasil akses ke endpoint `/health`:

```json
{
  "nama": "Palpal Yalmialam",
  "nrp": "5025241002",
  "status": "UP",
  "timestamp": 1774444106555,
  "uptime": 9.686
}
```

---

## Referensi

- [Docker Documentation - Multi-stage builds](https://docs.docker.com/build/building/multi-stage/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Ansible Documentation](https://docs.ansible.com/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Azure for Students](https://azure.microsoft.com/en-us/free/students/)
- [Youtube Video 1](https://youtu.be/R8_veQiYBjI?si=KZD8ad0oTw32Rx_q)
- [Youtube Video 2](https://youtu.be/YLtlz88zrLg?si=F1239PVoqWjge7V0)
