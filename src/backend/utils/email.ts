export async function sendEmailAlert(email: string, subject: string, message: string) {
    // In a real application, you would integrate Resend, NodeMailer, SendGrid, etc.
    console.log(`[EMAIL SEND MOCK] To: ${email} | Subject: ${subject}`);
    console.log(`[EMAIL CONTENT]\n${message}\n`);
}
