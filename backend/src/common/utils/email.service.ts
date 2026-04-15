export const sendEmail = async ({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}): Promise<{ success: boolean; message: string }> => {
  console.log(`[EMAIL] To: ${to}, Subject: ${subject}`);
  return { success: true, message: 'Email sent (placeholder)' };
};
