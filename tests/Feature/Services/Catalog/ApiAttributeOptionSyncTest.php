<?php

use App\Models\Attribute;
use App\Models\AttributeApiSource;
use App\Models\AttributeOption;
use App\Services\Catalog\ApiAttributeOptionSync;
use App\Services\Catalog\AttributeOptionMirror;
use Illuminate\Support\Facades\Http;

beforeEach(function () {
    $this->sync = new ApiAttributeOptionSync(new AttributeOptionMirror());
});

function apiSource(array $overrides = []): AttributeApiSource
{
    return AttributeApiSource::create(array_merge([
        'name' => 'Test Source',
        'endpoint' => 'https://example.test/colors',
        'method' => 'GET',
        'auth_type' => 'none',
        'rows_path' => 'data.items',
        'code_path' => 'id',
        'label_path' => 'name',
    ], $overrides));
}

function apiAttr(AttributeApiSource $source): Attribute
{
    return Attribute::create(['code' => 'attr_'.uniqid(), 'type' => 'select', 'api_source_id' => $source->id]);
}

test('rebuildAttribute maps rows from the configured paths into options', function () {
    $source = apiSource();
    Http::fake([$source->endpoint => Http::response([
        'data' => ['items' => [
            ['id' => 'red', 'name' => 'Red'],
            ['id' => 'blue', 'name' => 'Blue'],
        ]],
    ])]);
    $attribute = apiAttr($source);

    $this->sync->rebuildAttribute($attribute);

    $options = AttributeOption::where('attribute_id', $attribute->id)->get();
    expect($options->pluck('code')->all())->toContain('red', 'blue');
    expect($options->firstWhere('code', 'red')->admin_label)->toBe('Red');
});

test('rebuildAttribute with no api_source_id deletes every existing option', function () {
    $attribute = Attribute::create(['code' => 'plain', 'type' => 'select']);
    AttributeOption::create(['attribute_id' => $attribute->id, 'code' => 'leftover', 'admin_label' => 'x']);

    $this->sync->rebuildAttribute($attribute);

    expect(AttributeOption::where('attribute_id', $attribute->id)->count())->toBe(0);
});

test('a customized option keeps its own label across a rebuild instead of being overwritten by the API', function () {
    $source = apiSource();
    Http::fake([$source->endpoint => Http::response(['data' => ['items' => [['id' => 'red', 'name' => 'Red']]]])]);
    $attribute = apiAttr($source);
    $this->sync->rebuildAttribute($attribute);

    $option = AttributeOption::where('attribute_id', $attribute->id)->where('code', 'red')->first();
    $option->update(['admin_label' => 'Custom Label', 'is_customized' => true]);

    Http::fake([$source->endpoint => Http::response(['data' => ['items' => [['id' => 'red', 'name' => 'Renamed Upstream']]]])]);
    $this->sync->rebuildAttribute($attribute);

    expect($option->refresh()->admin_label)->toBe('Custom Label');
});

test('rebuildAttribute prunes an option whose code is no longer in the response', function () {
    $source = apiSource();
    Http::fake([
        $source->endpoint => Http::sequence()
            ->push(['data' => ['items' => [['id' => 'red', 'name' => 'Red'], ['id' => 'blue', 'name' => 'Blue']]]])
            ->push(['data' => ['items' => [['id' => 'red', 'name' => 'Red']]]]),
    ]);
    $attribute = apiAttr($source);
    $this->sync->rebuildAttribute($attribute);

    $this->sync->rebuildAttribute($attribute);

    expect(AttributeOption::where('attribute_id', $attribute->id)->pluck('code')->all())->toBe(['red']);
});

test('rebuildAttribute refuses to prune existing options down to zero on an empty-but-successful response', function () {
    $source = apiSource();
    Http::fake([
        $source->endpoint => Http::sequence()
            ->push(['data' => ['items' => [['id' => 'red', 'name' => 'Red']]]])
            ->push(['data' => ['items' => []]]),
    ]);
    $attribute = apiAttr($source);
    $this->sync->rebuildAttribute($attribute);
    expect(AttributeOption::where('attribute_id', $attribute->id)->count())->toBe(1);

    expect(fn () => $this->sync->rebuildAttribute($attribute))->toThrow(RuntimeException::class);
    expect(AttributeOption::where('attribute_id', $attribute->id)->count())->toBe(1);
});

test('rebuildAttribute throws on a non-2xx response', function () {
    $source = apiSource();
    Http::fake([$source->endpoint => Http::response('nope', 500)]);
    $attribute = apiAttr($source);

    expect(fn () => $this->sync->rebuildAttribute($attribute))->toThrow(RuntimeException::class);
});

test('rebuildAttribute sends the configured auth for each auth_type', function () {
    $bearerSource = apiSource(['endpoint' => 'https://example.test/bearer', 'auth_type' => 'bearer', 'credentials' => ['token' => 'secret-token']]);
    Http::fake([$bearerSource->endpoint => Http::response(['data' => ['items' => [['id' => 'a', 'name' => 'A']]]])]);

    $this->sync->rebuildAttribute(apiAttr($bearerSource));

    Http::assertSent(fn ($request) => $request->hasHeader('Authorization', 'Bearer secret-token'));
});

test('rebuildAll skips a failing source and still syncs the others, returning only the successful count', function () {
    $good = apiSource(['endpoint' => 'https://example.test/good']);
    $bad = apiSource(['endpoint' => 'https://example.test/bad']);
    Http::fake([
        $good->endpoint => Http::response(['data' => ['items' => [['id' => 'a', 'name' => 'A']]]]),
        $bad->endpoint => Http::response('down', 500),
    ]);
    $goodAttr = apiAttr($good);
    $badAttr = apiAttr($bad);

    $count = $this->sync->rebuildAll();

    expect($count)->toBe(1);
    expect(AttributeOption::where('attribute_id', $goodAttr->id)->exists())->toBeTrue();
    expect(AttributeOption::where('attribute_id', $badAttr->id)->exists())->toBeFalse();
});

test('preview maps rows without writing any options', function () {
    $source = apiSource();
    Http::fake([$source->endpoint => Http::response(['data' => ['items' => [['id' => 'red', 'name' => 'Red']]]])]);
    $attribute = apiAttr($source);

    $rows = $this->sync->preview($source);

    expect($rows)->toBe([['code' => 'red', 'label' => 'Red']]);
    expect(AttributeOption::where('attribute_id', $attribute->id)->count())->toBe(0);
});
