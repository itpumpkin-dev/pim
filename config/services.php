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

];
