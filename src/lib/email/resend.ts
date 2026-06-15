import { Resend } from 'resend'

function getResend() {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY is not set')
  return new Resend(key)
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string | string[]
  subject: string
  html: string
}) {
  const { data, error } = await getResend().emails.send({
    from: process.env.EMAIL_FROM ?? 'AHITS <noreply@agricarbon.com>',
    to,
    subject,
    html,
  })

  if (error) {
    throw new Error(`Resend error: ${error.message}`)
  }

  return data
}
