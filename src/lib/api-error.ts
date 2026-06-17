export async function extractApiError(res: Response): Promise<string> {
  try {
    const body = await res.json()
    if (typeof body.error === 'string') return body.error
    if (body.error?.formErrors?.length) return body.error.formErrors[0]
    return `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}
