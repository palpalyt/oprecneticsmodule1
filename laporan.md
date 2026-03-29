# Laporan Penugasan Modul 1
## Open Recruitment NETICS 2026
**Nama:** Palpal Yalmialam  
**NRP:** 5025241002  

---

## Deskripsi
Di modul penugasan ini, kita dianjurkan untuk implementasi CI/CD pipeline menggunakan GitHub Actions untuk melakukan otomasi proses build dan deployment API sederhana menggunakan Node.js, Docker, Ansible, dan Nginx sebagai reverse proxy pada VPS publik. VPS yang saya gunakan untuk mengerjakan modul ini adalah Azure.

---

## Teknologi yang Digunakan
- **API:** Node.js + Express.js
- **Containerization:** Docker
- **VPS:** Microsoft Azure (Ubuntu 24.04)
- **CI/CD:** GitHub Actions
- **Reverse Proxy:** Nginx (dikonfigurasi via Ansible)
- **Container Registry:** Docker Hub

---

## Docker Image
https://hub.docker.com/r/palpalyt/neticsmodul1

---

## URL API
http://70.153.144.111/health

---

## Struktur Repositori
```
.
├── .github/
│   └── workflows/
│       ├── ci.yml        # CI Pipeline - build & push Docker image
│       └── cd.yml        # CD Pipeline - deploy ke VPS via Ansible
├── ansible/
│   ├── playbook.yml      # Install & konfigurasi Nginx
│   └── nginx.conf.j2     # Template konfigurasi Nginx
├── Dockerfile            # Multi-stage build
├── server.js             # API dengan endpoint /health
└── package.json
```

---

## Penjelasan

### 1. Pembuatan API
API dibuat menggunakan Node.js dan Express.js dengan endpoint `/health` yang mengembalikan informasi nama, NRP, status, timestamp, dan uptime server.

```
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