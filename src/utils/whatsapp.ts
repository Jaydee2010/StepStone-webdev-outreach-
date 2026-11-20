/**
 * Normalizes Nigerian or international phone strings into clean WhatsApp digits
 * suitable for https://wa.me/<digits> (without '+' or spaces).
 * Returns null if no plausible phone number is found.
 */
export function formatNigerianWhatsAppDigits(
  rawPhone: string | null | undefined
): string | null {
  if (!rawPhone) return null;

  const segments = rawPhone
    .split(/[,/;|]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const segment of segments) {
    let digits = segment.replace(/\D/g, '');
    if (!digits) continue;

    // Handle accidental 00234... international prefix
    if (digits.startsWith('00234') && digits.length >= 15) {
      digits = `234${digits.slice(5)}`;
    }
    // Handle +234080... accidental extra zero after country code
    if (digits.startsWith('2340') && digits.length === 14) {
      digits = `234${digits.slice(4)}`;
    }
    // Convert standard 11-digit Nigerian local format (080..., 081..., 070..., 090..., 091...)
    if (digits.length === 11 && digits.startsWith('0')) {
      digits = `234${digits.slice(1)}`;
    }
    // Convert 10-digit Nigerian number missing leading zero (e.g. 8039448950)
    if (digits.length === 10 && /^[789]/.test(digits)) {
      digits = `234${digits}`;
    }

    if (digits.length >= 10 && digits.length <= 15) {
      return digits;
    }
  }

  return null;
}

/**
 * Builds an official WhatsApp Click-to-Chat URL with pre-filled message text.
 * If no valid phone number is saved on the lead, falls back to wa.me/?text=...
 * so WhatsApp still opens with the message ready to assign to a contact.
 */
export function buildWhatsAppChatUrl(
  phone: string | null | undefined,
  message: string
): string {
  const digits = formatNigerianWhatsAppDigits(phone);
  const encodedText = encodeURIComponent(message.trim());
  return digits
    ? `https://wa.me/${digits}?text=${encodedText}`
    : `https://wa.me/?text=${encodedText}`;
}
