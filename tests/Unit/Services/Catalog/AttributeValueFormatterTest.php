<?php

use App\Models\Attribute;
use App\Services\Catalog\AttributeValueFormatter;
use Illuminate\Support\Facades\Storage;

// Needed for the full app container (Storage::fake() calls storage_path()),
// which plain tests/Unit files don't get — see tests/Pest.php, which only
// binds Tests\TestCase (and RefreshDatabase) to the Feature directory.
uses(Tests\TestCase::class);

function makeAttribute(string $type): Attribute
{
    return new Attribute(['type' => $type]);
}

test('a null raw value formats to null regardless of attribute type', function () {
    expect(AttributeValueFormatter::format(makeAttribute('text'), null))->toBeNull();
    expect(AttributeValueFormatter::format(makeAttribute('image'), null))->toBeNull();
    expect(AttributeValueFormatter::format(makeAttribute('gallery'), null))->toBeNull();
});

test('an empty-string raw value formats to null regardless of attribute type', function () {
    expect(AttributeValueFormatter::format(makeAttribute('text'), ''))->toBeNull();
    expect(AttributeValueFormatter::format(makeAttribute('image'), ''))->toBeNull();
});

test('a plain text/select attribute passes its raw value through untouched', function () {
    expect(AttributeValueFormatter::format(makeAttribute('text'), 'Hello World'))->toBe('Hello World');
    expect(AttributeValueFormatter::format(makeAttribute('select'), 'option_code'))->toBe('option_code');
});

test('an image/file/video attribute resolves a relative path to a public disk URL', function () {
    Storage::fake('public');

    $url = AttributeValueFormatter::format(makeAttribute('image'), 'attributes/photo.jpg');

    expect($url)->toBe(Storage::disk('public')->url('attributes/photo.jpg'));
    expect($url)->toContain('attributes/photo.jpg');
});

test('file and video types resolve the same way as image', function () {
    Storage::fake('public');

    expect(AttributeValueFormatter::format(makeAttribute('file'), 'docs/manual.pdf'))
        ->toBe(Storage::disk('public')->url('docs/manual.pdf'));

    expect(AttributeValueFormatter::format(makeAttribute('video'), 'media/clip.mp4'))
        ->toBe(Storage::disk('public')->url('media/clip.mp4'));
});

test('an already-absolute URL passes through untouched instead of being re-based under the public disk', function () {
    Storage::fake('public');

    $external = 'https://example.com/imported/photo.jpg';

    expect(AttributeValueFormatter::format(makeAttribute('image'), $external))->toBe($external);
});

test('an http (non-https) absolute URL also passes through untouched', function () {
    Storage::fake('public');

    $external = 'http://example.com/imported/photo.jpg';

    expect(AttributeValueFormatter::format(makeAttribute('image'), $external))->toBe($external);
});

test('a gallery attribute decodes a JSON array of paths and resolves each one', function () {
    Storage::fake('public');

    $raw = json_encode(['gallery/a.jpg', 'gallery/b.jpg']);

    expect(AttributeValueFormatter::format(makeAttribute('gallery'), $raw))->toBe([
        Storage::disk('public')->url('gallery/a.jpg'),
        Storage::disk('public')->url('gallery/b.jpg'),
    ]);
});

test('a gallery attribute mixing relative paths and absolute URLs resolves each independently', function () {
    Storage::fake('public');

    $raw = json_encode(['gallery/a.jpg', 'https://cdn.example.com/b.jpg']);

    expect(AttributeValueFormatter::format(makeAttribute('gallery'), $raw))->toBe([
        Storage::disk('public')->url('gallery/a.jpg'),
        'https://cdn.example.com/b.jpg',
    ]);
});

test('a gallery attribute with malformed JSON falls back to an empty array instead of throwing', function () {
    expect(AttributeValueFormatter::format(makeAttribute('gallery'), 'not-json'))->toBe([]);
});

test('a gallery attribute with a JSON-encoded empty array formats to an empty array', function () {
    expect(AttributeValueFormatter::format(makeAttribute('gallery'), '[]'))->toBe([]);
});

test('resolveStorageUrl on a null or empty path returns null directly', function () {
    expect(AttributeValueFormatter::resolveStorageUrl(null))->toBeNull();
    expect(AttributeValueFormatter::resolveStorageUrl(''))->toBeNull();
});
