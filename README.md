# Creative Resizer (Deployable)

Upload up to **3 images**, pick output sizes, and download **all outputs as a ZIP**.

This version is built to deploy on **Render** using Docker (ImageMagick is installed in the container).

## Local run

```bash
npm install
npm run demo
```

Open `http://localhost:3000`.

## Render deploy

- **Environment**: Docker
- **Root directory**: `image-resizing`
- **Dockerfile path**: `Dockerfile`
- **Health check path**: `/`

