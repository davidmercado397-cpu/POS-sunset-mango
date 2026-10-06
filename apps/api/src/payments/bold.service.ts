import { Injectable, NotImplementedException } from '@nestjs/common';
import { OnlineOrder, Tenant } from '@prisma/client';
import { decryptSecret } from '../common/secret-box';

/**
 * Pasarela de pagos Bold — PENDIENTE DE INTEGRAR.
 *
 * Ya está listo: el administrador del negocio guarda su llave de identidad y su llave secreta
 * (cifrada) en Administración → Pagos en línea, y esta clase centraliza el acceso a ellas.
 *
 * Para activar el pago en línea falta:
 *  1. Implementar `createPaymentLink` con la API de Bold (documentación: https://developers.bold.co).
 *     Debe devolver la URL de pago para un pedido en línea (referencia = código del pedido).
 *  2. Exponer un webhook público (por ejemplo POST /api/public/payments/bold/webhook) que valide la
 *     firma con la llave secreta y marque `OnlineOrder.paymentStatus = PAID` con la referencia de Bold.
 *  3. Cambiar `INTEGRATION_READY` a true. Con eso, la tienda pública ofrece "Pago en línea con Bold".
 */
const INTEGRATION_READY = false;

@Injectable()
export class BoldService {
  /** Indica si la tienda puede ofrecer el pago con Bold. */
  isReady(tenant: Pick<Tenant, 'boldEnabled' | 'boldIdentityKey' | 'boldSecretKeyEnc'>): boolean {
    return INTEGRATION_READY && tenant.boldEnabled && !!tenant.boldIdentityKey && !!tenant.boldSecretKeyEnc;
  }

  get integrationReady() {
    return INTEGRATION_READY;
  }

  /** Llaves del negocio (la secreta se descifra solo en el servidor). */
  credentials(tenant: Pick<Tenant, 'boldIdentityKey' | 'boldSecretKeyEnc'>) {
    return {
      identityKey: tenant.boldIdentityKey ?? '',
      secretKey: tenant.boldSecretKeyEnc ? decryptSecret(tenant.boldSecretKeyEnc) : '',
    };
  }

  async createPaymentLink(_tenant: Tenant, _order: OnlineOrder): Promise<{ url: string }> {
    throw new NotImplementedException('La integración con Bold está pendiente de configurar');
  }
}
