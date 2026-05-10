import { prisma } from '../prisma.ts';
import { sendEmailAlert } from '../utils/email.ts';
import { differenceInDays } from 'date-fns';

// This is a naive memory set to avoid spamming the logs during dev mode.
// In a real database, you'd save an "alertSent" flag.
const sentAlerts = new Set<string>();

export async function checkCertificatesJob() {
    console.log('[CRON] Running certificate expiration check...');
    try {
        const companies = await prisma.company.findMany({
            include: { user: true, certificate: true }
        });

        for (const company of companies) {
           if (!company.certificate) continue;
           
           const daysLeft = differenceInDays(new Date(company.certificate.expiresAt), new Date());
           
           if (daysLeft === 30 || daysLeft === 14 || daysLeft === 7) {
               const alertKey = `${company.id}-${daysLeft}`;
               if (!sentAlerts.has(alertKey)) {
                   await sendEmailAlert(
                       company.user.email,
                       `Alerta de Certificado: ${company.name}`,
                       `O certificado digital da empresa ${company.name} irá expirar em ${daysLeft} dias. Por favor, acesse o sistema e atualize o certificado.`
                   );
                   sentAlerts.add(alertKey);
               }
           }
        }
    } catch (e) {
        console.error('[CRON] Failed to check certificates:', e);
    }
}
