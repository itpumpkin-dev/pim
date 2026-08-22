<?php

namespace App\Services\WooCommerce;

use RuntimeException;

/**
 * Same RuntimeException WooCommerceClient always threw on an API error —
 * still catchable exactly that way everywhere existing code already does
 * (e.g. WooCommerceClient::getProduct()'s own `catch (RuntimeException)`) —
 * but also carries WooCommerce's own machine-readable error code/data
 * (`$data['code']`/`$data['data']` from the response body) for callers that
 * need to act on *which* error happened, not just log its message. Added
 * 2026-08-22 for WooCommerceProductSyncService::push()'s product_invalid_sku
 * recovery — see that method's docblock.
 */
class WooCommerceApiException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly ?string $apiErrorCode = null,
        public readonly array $errorData = [],
    ) {
        parent::__construct($message);
    }
}
