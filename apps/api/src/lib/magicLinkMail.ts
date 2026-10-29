export const MAGIC_LINK_SUBJECT = "Atender にログインする";

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans','Noto Sans JP',sans-serif";

export function buildMagicLinkMail(url: string): { subject: string; html: string; text: string } {
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>Atender にログインする</title>
</head>
<body style="margin:0;padding:0;font-family:${FONT};background:#F3F7FB;color:#30415B;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F3F7FB;padding:40px 20px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#FFFFFF;border-radius:14px;padding:36px;">
<tr><td style="text-align:left;padding-bottom:28px;"><img src="https://atender.appily.run/wordmark-mail.png" alt="Atender" width="164" height="44" style="display:block;border:0;" /></td></tr>
<tr><td style="color:#30415B;font-size:18px;font-weight:700;padding-bottom:12px;">ログインリンクが届いています</td></tr>
<tr><td style="color:#30415B;font-size:14px;line-height:1.7;padding-bottom:28px;">下のボタンを開くと Atender にログインできます。リンクの有効期限は <strong>15 分</strong>です。心当たりがなければそのまま閉じてください。</td></tr>
<tr><td align="center" style="padding-bottom:28px;"><a href="${url}" style="display:inline-block;background:#1E96E6;color:#FFFFFF;text-decoration:none;font-weight:700;padding:14px 32px;border-radius:10px;font-size:15px;">ログインする</a></td></tr>
<tr><td style="color:#6B7A90;font-size:12px;line-height:1.6;padding-top:24px;border-top:1px solid #E3EAF2;">リンクが開けないときは下記の URL を直接ブラウザに貼り付けてください:<br /><a href="${url}" style="color:#147FCC;word-break:break-all;">${url}</a></td></tr>
<tr><td style="color:#8A96A8;font-size:11px;line-height:1.6;text-align:center;padding-top:28px;">このメールは Atender のログイン操作によって送信されました。<br />Atender · https://atender.appily.run</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  const text = `Atender にログインする\n\n下記のリンクを開くとログインできます (有効期限 15 分):\n${url}\n\n心当たりがなければそのまま閉じてください。\n\nこのメールは Atender のログイン操作によって送信されました。\n\n-- \nAtender\nhttps://atender.appily.run`;
  return { subject: MAGIC_LINK_SUBJECT, html, text };
}
