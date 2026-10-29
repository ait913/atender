正典はレイアウト・文言が [.designs/20261030-landing-page-v2-layout.md](../../.designs/20261030-landing-page-v2-layout.md)、配信 (Docker / nginx / Coolify) が [.designs/20261030-landing-page-and-social-image.md](../../.designs/20261030-landing-page-and-social-image.md) §5。

atender の LP (`https://atender.aisaba.net`)。静的 HTML を nginx-unprivileged で配信する。Coolify の `base_directory` は `/apps/lp`。

```sh
# ローカル確認 (Coolify と同じ起動オプション)
docker build -f apps/lp/Dockerfile -t atender-lp:local apps/lp
docker run -d --name atender-lp-local -p 18080:8080 --cap-drop ALL --security-opt no-new-privileges=true --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m --pids-limit 256 atender-lp:local
node mocks/social/lp-shots.mjs     # 320/375/1280 のスクショ + 崩れ検査 (.tmp/lp-shots/)
docker rm -f atender-lp-local
```
