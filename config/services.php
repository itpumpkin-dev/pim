<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'resend' => [
        'key' => env('RESEND_KEY'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'ecommerce_api' => [
        'key' => env('ECOMMERCE_API_KEY'),
    ],

    'lazada' => [
        'base_url' => env('LAZADA_API_BASE_URL', 'https://api.lazada.co.th/rest'),
    ],

    'shopee' => [
        'base_url' => env('SHOPEE_API_BASE_URL', 'https://partner.shopeemobile.com'),
    ],

    // Unlike lazada/shopee (whose app_key/app_secret live per-seller-account
    // in n8n's tables — see LazadaSellerAccount/ShopeeSellerAccount), TikTok
    // Shop uses one Partner app shared across every connected seller: the
    // per-seller n8n row (tiktok_tokens) only carries access_token/
    // shops_cipher, not app credentials. app_key/app_secret here are that
    // single Partner app's own credentials, registered once in TikTok Shop
    // Partner Center — needed before TikTokClient can sign a single request.
    'tiktok' => [
        'base_url' => env('TIKTOK_API_BASE_URL', 'https://open-api.tiktokglobalshop.com'),
        'app_key' => env('TIKTOK_APP_KEY'),
        'app_secret' => env('TIKTOK_APP_SECRET'),
    ],

    // Single site's credentials, not yet a per-shop model like the other
    // three marketplaces (see WooCommerceProductSyncService::forShop()'s
    // docblock). Two separate credential pairs are needed:
    // consumer_key/consumer_secret (WooCommerce's own REST API, wc/v3 only)
    // for products/categories, and wp_username/wp_app_password (a WordPress
    // core Application Password, NOT the WooCommerce key) for the Media
    // Library API (wp/v2/media) — confirmed live, 2026-08-20: the WooCommerce
    // key gets a 401 rest_cannot_create against wp/v2/media even though it
    // works fine for every wc/v3 call.
    'woocommerce' => [
        'url' => env('WOOCOMMERCE_URL'),
        'consumer_key' => env('WOOCOMMERCE_CONSUMER_KEY'),
        'consumer_secret' => env('WOOCOMMERCE_CONSUMER_SECRET'),
        'wp_username' => env('WOOCOMMERCE_WP_USERNAME'),
        'wp_app_password' => env('WOOCOMMERCE_WP_APP_PASSWORD'),
    ],

    // Direct MySQL access to the same WordPress/WooCommerce site's database
    // (TranslatePress's translation tables aren't exposed by any REST API —
    // see TranslatePressTranslationSyncService's docblock). MySQL there only
    // binds to localhost, so it's only reachable through an SSH tunnel —
    // WordPressTunnel opens it before WordPressDatabase connects.
    'wordpress_db' => [
        'ssh_host' => env('WORDPRESS_SSH_HOST'),
        'ssh_port' => env('WORDPRESS_SSH_PORT', 22),
        'ssh_username' => env('WORDPRESS_SSH_USERNAME'),
        'ssh_password' => env('WORDPRESS_SSH_PASSWORD'),
        'db_host' => env('WORDPRESS_DB_HOST', 'localhost'),
        'db_port' => env('WORDPRESS_DB_PORT', 3306),
        'db_database' => env('WORDPRESS_DB_DATABASE'),
        'db_username' => env('WORDPRESS_DB_USERNAME'),
        'db_password' => env('WORDPRESS_DB_PASSWORD'),
    ],

];
