export async function sendInviteEmail({ to, displayName, leagueName, inviteLink }) {
  const subject = `You're invited to ${leagueName} on World Cup 26 Prediction`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
      <h1>Join ${escapeHtml(leagueName)}</h1>
      <p>${escapeHtml(displayName || "Friend")}, you have been invited to play World Cup 26 Prediction.</p>
      <p><a href="${inviteLink}" style="display:inline-block;background:#18c964;color:white;padding:12px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Accept invite</a></p>
      <p>Or paste this link into your browser:</p>
      <p>${inviteLink}</p>
    </div>
  `;

  if (!process.env.RESEND_API_KEY) {
    return {
      provider: "mock",
      status: "MOCK_SENT",
      subject,
      html,
      inviteLink,
      providerMessageId: null
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.INVITE_FROM_EMAIL || "World Cup 26 Prediction <onboarding@resend.dev>",
      to,
      subject,
      html
    })
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(`Email provider failed: ${JSON.stringify(result)}`);
  }

  return {
    provider: "resend",
    status: "SENT",
    subject,
    html,
    inviteLink,
    providerMessageId: result.id || null
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}
