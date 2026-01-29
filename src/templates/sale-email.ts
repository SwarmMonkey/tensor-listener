/**
 * Sale Email Template
 * 
 * Dark-themed HTML email template for notifying users when their NFT is sold.
 */

export interface SaleEmailData {
  nftName: string;
  price: number;
  currency: 'SOL' | 'USDC';
  walletAddress: string;
  displayName?: string | null;
}

export function generateSaleEmail(data: SaleEmailData): string {
  const { nftName, price, currency, walletAddress, displayName } = data;
  
  const priceDisplay = currency === 'SOL' 
    ? `◎${price.toFixed(4)} SOL`
    : `$${price.toFixed(2)} USDC`;
  
  const truncatedWallet = truncateWallet(walletAddress);
  const greeting = displayName || 'there';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Card Sold!</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0a0a0a; color: #e5e5e5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #0a0a0a;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #1a1a1a; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);">
              <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">
                🎉 Your Card Sold!
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #d4d4d4;">
                Hi ${greeting},
              </p>
              
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #d4d4d4;">
                Great news! Your card has been sold:
              </p>
              
              <!-- NFT Details Card -->
              <div style="background-color: #252525; border-radius: 8px; padding: 24px; margin: 24px 0; border: 1px solid #333333;">
                <p style="margin: 0 0 12px; font-size: 18px; font-weight: 600; color: #ffffff;">
                  ${escapeHtml(nftName)}
                </p>
                <p style="margin: 0 0 8px; font-size: 14px; color: #a3a3a3;">
                  Sold for: <span style="color: #60a5fa; font-weight: 600; font-size: 20px;">${priceDisplay}</span>
                </p>
                <p style="margin: 0; font-size: 14px; color: #a3a3a3;">
                  Buyer: <span style="color: #e5e5e5; font-family: monospace;">${truncatedWallet}</span>
                </p>
              </div>
              
              <p style="margin: 24px 0; font-size: 16px; line-height: 1.6; color: #d4d4d4;">
                Thank you for using Graded!
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 32px 0;">
                <tr>
                  <td align="center" style="padding: 0;">
                    <a href="https://graded.app" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3); transition: all 0.2s;">
                      View on Graded
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; text-align: center; background-color: #141414; border-top: 1px solid #333333;">
              <p style="margin: 0 0 8px; font-size: 12px; color: #737373;">
                This is an automated notification from Graded
              </p>
              <p style="margin: 0; font-size: 12px; color: #737373;">
                <a href="https://graded.app" style="color: #60a5fa; text-decoration: none;">graded.app</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function truncateWallet(wallet: string): string {
  if (wallet.length <= 8) return wallet;
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
