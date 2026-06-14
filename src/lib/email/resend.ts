import { Resend } from 'resend'

export const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string | string[]
  subject: string
  html: string
}) {
  return resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'AHITS <noreply@agricarbon.com>',
    to,
    subject,
    html,
  })
}
