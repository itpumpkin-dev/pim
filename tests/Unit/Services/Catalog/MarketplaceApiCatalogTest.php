<?php

use App\Services\Catalog\MarketplaceApiCatalog;

test('returns exactly the four wired marketplace platforms', function () {
    expect(array_keys(MarketplaceApiCatalog::platforms()))->toBe(['shopee', 'lazada', 'tiktok', 'woocommerce']);
});

test('every platform entry has the required top-level keys with non-empty string values', function () {
    foreach (MarketplaceApiCatalog::platforms() as $key => $platform) {
        expect($platform)->toHaveKeys(['label', 'baseUrl', 'auth', 'tokenSource', 'groups']);
        expect($platform['label'])->toBeString()->not->toBe('');
        expect($platform['baseUrl'])->toBeString()->not->toBe('');
        expect($platform['auth'])->toBeString()->not->toBe('');
        expect($platform['tokenSource'])->toBeString()->not->toBe('');
        expect($platform['groups'])->toBeArray()->not->toBeEmpty();
    }
});

test('every group has a non-empty label and at least one operation', function () {
    foreach (MarketplaceApiCatalog::platforms() as $platform) {
        foreach ($platform['groups'] as $group) {
            expect($group)->toHaveKeys(['label', 'operations']);
            expect($group['label'])->toBeString()->not->toBe('');
            expect($group['operations'])->toBeArray()->not->toBeEmpty();
        }
    }
});

test('every operation has all required fields, a real HTTP-ish method, and a boolean write flag', function () {
    foreach (MarketplaceApiCatalog::platforms() as $platformKey => $platform) {
        foreach ($platform['groups'] as $group) {
            foreach ($group['operations'] as $operation) {
                expect($operation)->toHaveKeys(['method', 'endpoint', 'purpose', 'source', 'write']);
                expect($operation['method'])->toBeString()->not->toBe('');
                expect($operation['endpoint'])->toBeString()->not->toBe('');
                expect($operation['purpose'])->toBeString()->not->toBe('');
                expect($operation['source'])->toBeString()->not->toBe('');
                expect($operation['write'])->toBeBool();

                // Every method token in a possibly-combined field like "GET/POST"
                // or a multi-step "POST" chain must be a real HTTP verb (or the
                // WooCommerce TranslatePress row's literal "SQL" marker).
                foreach (preg_split('#[/\s]+#', $operation['method']) as $token) {
                    expect($token)->toBeIn(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'SQL']);
                }
            }
        }
    }
});

test('every operation\'s source references a real *Client or *ProductSyncService/*Controller class name', function () {
    foreach (MarketplaceApiCatalog::platforms() as $platform) {
        foreach ($platform['groups'] as $group) {
            foreach ($group['operations'] as $operation) {
                expect($operation['source'])->toMatch('/[A-Za-z]+::[a-zA-Z]+\(\)/');
            }
        }
    }
});

test('a write operation is never described with a plain GET method', function () {
    foreach (MarketplaceApiCatalog::platforms() as $platform) {
        foreach ($platform['groups'] as $group) {
            foreach ($group['operations'] as $operation) {
                if ($operation['write'] === true) {
                    expect($operation['method'])->not->toBe('GET');
                }
            }
        }
    }
});
