# Skyline Volley

A portrait, real-time, two-player beach volleyball game for desktop and mobile browsers.

## Play locally

```bash
npm install
npm run dev
```

Open the printed local URL and choose **Practice against AI**.

## Play online

Deploy the repository to GitHub Pages. One player chooses **Create online match** and sends the generated invite link to the other player. Online room discovery uses PeerJS; live gameplay travels directly between the two browsers when possible.

## Play without internet on the same Wi-Fi

On one computer:

```bash
npm install
npm run lan
```

Keep the terminal open. It prints a `Same Wi-Fi` address such as `http://192.168.1.20:4173`. Both players open that address, the host chooses **Create LAN**, and shares the generated room link. Your firewall may ask for permission the first time.

## Controls

- Move: WASD, arrow keys, or the on-screen direction pad
- Jump: Space
- Bump / serve: Z or Enter
- Spike: X while jumping near the ball

## Rules in this adaptation

- First to 15 points, win by two
- Up to three contacts per side
- A fourth touch, net hit, or out ball is a fault
- No side changes or player rotation (fast 1-v-1 format)

## Deploy to GitHub Pages

1. Push the repository to a GitHub repository.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, choose **GitHub Actions**.
4. Push to `main`; the included workflow builds and publishes the game.

The static GitHub Pages build provides online PeerJS play. Offline Wi-Fi play uses the included local server because browsers need a machine on the network to introduce the two players when the internet is unavailable.
