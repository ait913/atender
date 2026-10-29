# atender LP。正典: .designs/20261030-landing-page-and-social-image.md §5
# 1.31-alpine = minor 固定 + patch 自動追従 (nwasabi-hp と同じ取引。2026-10-30 に Docker Hub でタグ実在を確認)
FROM nginxinc/nginx-unprivileged:1.31-alpine
# 配信範囲 = site/ の中身だけ。docroot はベースイメージの /usr/share/nginx/html (50x.html 同梱) でなく自前のディレクトリ
COPY site/ /var/www/site/
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
