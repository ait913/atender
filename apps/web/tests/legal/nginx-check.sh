#!/bin/sh
# 設計 20261009-build20-account-deletion-legal.md §13.10 #L7-#L9 (Reviewer 生成)。
# 使い方: リポジトリ root から `sh apps/web/tests/legal/nginx-check.sh` (Docker の nginx:alpine が要る)。
# 全項目 OK なら exit 0、1 件でも NG なら exit 1。
set -u
ROOT=$(cd "$(dirname "$0")/../../../.." && pwd)
T=$(mktemp -d)
cp -R "$ROOT/apps/web/public/." "$T/"
echo '<html>SPA-MARKER</html>' > "$T/index.html"
NAME=atender-b20-ngx
PORT=18089
docker rm -f $NAME >/dev/null 2>&1
docker run -d --rm --name $NAME -p $PORT:80 \
  -v "$T:/usr/share/nginx/html:ro" \
  -v "$ROOT/apps/web/nginx.conf:/etc/nginx/conf.d/default.conf:ro" nginx:alpine >/dev/null || exit 1
sleep 2
FAIL=0
check() { # name, ok(0/1)
  if [ "$2" -eq 0 ]; then echo "ok   $1"; else echo "FAIL $1"; FAIL=1; fi
}
titles() { echo "privacy:プライバシーポリシー | Atender terms:利用規約 | Atender support:サポート | Atender"; }
for entry in "privacy:プライバシーポリシー | Atender" "terms:利用規約 | Atender" "support:サポート | Atender"; do
  p=${entry%%:*}
  title=${entry#*:}
  out=$(curl -s -i "http://localhost:$PORT/$p")
  echo "$out" | head -1 | grep -q " 200 "; check "#L7 /$p -> 200" $?
  echo "$out" | grep -qi '^content-type: text/html; charset=utf-8'; check "#L7 /$p content-type" $?
  echo "$out" | grep -q "<title>$title</title>"; check "#L7 /$p title" $?
  out=$(curl -s -i "http://localhost:$PORT/$p/")
  echo "$out" | head -1 | grep -q " 301 "; check "#L8 /$p/ -> 301" $?
  echo "$out" | grep -qi "^location: /$p\r\?$"; check "#L8 /$p/ Location is relative /$p" $?
done
for p in settings templates ""; do
  curl -s -i "http://localhost:$PORT/$p" | grep -q SPA-MARKER; check "#L9 /$p -> SPA" $?
done
curl -s -i "http://localhost:$PORT/privacy.html" | grep -q "<title>プライバシーポリシー | Atender</title>"; check "#L9 /privacy.html -> privacy.html" $?
docker rm -f $NAME >/dev/null 2>&1
rm -rf "$T"
exit $FAIL
