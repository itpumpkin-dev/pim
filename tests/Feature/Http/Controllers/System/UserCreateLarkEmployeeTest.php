<?php

use App\Http\Controllers\System\UserController;
use App\Http\Requests\System\StoreUserRequest;
use App\Models\Department;
use App\Models\JobPosition;
use App\Models\User;
use App\Services\Lark\LarkEmployeeDirectory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

/**
 * Create-user dialog: "ดึงข้อมูล" looks the employee up in the Lark Base HR
 * table by PRS_NO (UserController::larkEmployee()), and Department / Job
 * position are now free text resolved to the master tables by name on store().
 */
function uclController(): UserController
{
    return app(UserController::class);
}

function uclLookup(string $employeeId): JsonResponse
{
    return uclController()->larkEmployee(
        Request::create('/system/user/lark-employee', 'GET', ['employee_id' => $employeeId]),
        app(LarkEmployeeDirectory::class),
    );
}

function uclFakeLark(array $items, ?array $authResponse = null): void
{
    config()->set('services.lark', [
        'base_url' => 'https://lark.test/open-apis',
        'app_id' => 'cli_test',
        'app_secret' => 'secret',
        'employee_app_token' => 'app_token',
        'employee_table_id' => 'tbl_test',
    ]);
    Cache::forget('lark.tenant_access_token');

    Http::fake([
        'lark.test/open-apis/auth/*' => Http::response($authResponse ?? ['code' => 0, 'tenant_access_token' => 't-abc', 'expire' => 7200]),
        'lark.test/open-apis/bitable/*' => Http::response(['code' => 0, 'data' => ['items' => $items, 'total' => count($items)]]),
    ]);
}

test('lark-employee maps the HR record (search API rich-text cells included) onto the form fields', function () {
    uclFakeLark([[
        'fields' => [
            'PRS_NO' => [['type' => 'text', 'text' => '36005']],
            'EMP_NAME' => [['type' => 'text', 'text' => 'ภิญโย']],
            'EMP_SURNME' => 'พลเยี่ยม',
            'EMP_EMAIL' => 'pinyo@example.com',
            'PRO_DEPT' => 'แผนกขาย  กทม.',
            'JBT_THAIDESC' => 'พนักงานขาย (กทม.)',
        ],
    ]]);

    $response = uclLookup('36005');

    expect($response->status())->toBe(200);
    expect($response->getData(true))->toBe(['employee' => [
        'employee_id' => '36005',
        'first_name' => 'ภิญโย',
        'last_name' => 'พลเยี่ยม',
        'email' => 'pinyo@example.com',
        'department' => 'แผนกขาย กทม.',
        'job_position' => 'พนักงานขาย (กทม.)',
        'has_photo' => false,
    ]]);

    Http::assertSent(fn ($request) => str_contains($request->url(), '/records/search')
        && $request->hasHeader('Authorization', 'Bearer t-abc')
        && ($request['filter']['conditions'][0] ?? null) === ['field_name' => 'PRS_NO', 'operator' => 'is', 'value' => ['36005']]);
});

test('lark-employee returns 404 when no employee has that PRS_NO', function () {
    uclFakeLark([]);

    expect(uclLookup('99999')->status())->toBe(404);
});

test('lark-employee returns 502 with Lark\'s message when authentication is rejected', function () {
    uclFakeLark([], ['code' => 10003, 'msg' => 'invalid param']);

    $response = uclLookup('36005');

    expect($response->status())->toBe(502);
    expect($response->getData(true)['message'])->toContain('invalid param');
});

test('store() links department / job position by name, reusing an existing one and creating a missing one', function () {
    $existing = Department::create(['name' => 'แผนกขาย กทม.', 'enabled' => true]);

    $request = StoreUserRequest::create('/system/user', 'POST', [
        'username' => 'ucl_'.uniqid(),
        'employee_id' => 'UCL'.uniqid(),
        'password' => 'Str0ng!Passw0rd#2026',
        'password_confirmation' => 'Str0ng!Passw0rd#2026',
        'first_name' => 'ภิญโย',
        'last_name' => 'พลเยี่ยม',
        'email' => 'ucl'.uniqid().'@example.com',
        'department_name' => '  แผนกขาย   กทม. ',
        'job_position_name' => 'พนักงานขาย (กทม.) UCL',
    ]);
    $request->setContainer(app())->setRedirector(app('redirect'))->validateResolved();

    uclController()->store($request, app(LarkEmployeeDirectory::class));

    $created = User::where('first_name', 'ภิญโย')->latest('id')->first();
    expect($created->department_id)->toBe($existing->id);
    expect(Department::where('name', 'แผนกขาย กทม.')->count())->toBe(1);
    expect(JobPosition::find($created->job_position_id)?->name)->toBe('พนักงานขาย (กทม.) UCL');
});

function uclStoreRequest(array $overrides = []): StoreUserRequest
{
    $request = StoreUserRequest::create('/system/user', 'POST', array_merge([
        'username' => 'ucl_'.uniqid(),
        'employee_id' => '36001',
        'password' => 'Str0ng!Passw0rd#2026',
        'password_confirmation' => 'Str0ng!Passw0rd#2026',
        'first_name' => 'UclPhoto',
        'last_name' => 'Test',
        'email' => 'ucl'.uniqid().'@example.com',
    ], $overrides));
    $request->setContainer(app())->setRedirector(app('redirect'))->validateResolved();

    return $request;
}

function uclFakeLarkWithPhoto(int $photoStatus = 200): void
{
    $image = imagecreatetruecolor(1200, 800);
    ob_start();
    imagejpeg($image);
    $jpeg = ob_get_clean();

    uclFakeLark([[
        'fields' => [
            'PRS_NO' => '36001',
            'EMP_NAME' => 'สมชาย',
            'EMP_PHOTO' => [[
                'file_token' => 'tok123',
                'name' => '36001.jpg',
                'type' => 'image/jpeg',
                'url' => 'https://lark.test/open-apis/drive/v1/medias/tok123/download?extra=perm',
            ]],
        ],
    ]]);
    Http::fake(['lark.test/open-apis/drive/*' => Http::response($photoStatus === 200 ? $jpeg : 'nope', $photoStatus, ['Content-Type' => 'image/jpeg'])]);
}

test('store() saves the HR photo, downscaled, as the avatar when use_lark_photo is ticked', function () {
    Storage::fake('public');
    uclFakeLarkWithPhoto();

    expect(uclLookup('36001')->getData(true)['employee']['has_photo'])->toBeTrue();

    uclController()->store(uclStoreRequest(['use_lark_photo' => true]), app(LarkEmployeeDirectory::class));

    $user = User::where('first_name', 'UclPhoto')->latest('id')->first();
    expect($user->avatar_path)->toStartWith('avatars/');
    Storage::disk('public')->assertExists($user->avatar_path);

    [$width, $height] = getimagesizefromstring(Storage::disk('public')->get($user->avatar_path));
    expect([$width, $height])->toBe([512, 341]);

    Http::assertSent(fn ($request) => str_contains($request->url(), '/drive/v1/medias/tok123/download?extra=perm')
        && $request->hasHeader('Authorization', 'Bearer t-abc'));
});

test('store() skips the photo when use_lark_photo is not ticked', function () {
    Storage::fake('public');
    uclFakeLarkWithPhoto();

    uclController()->store(uclStoreRequest(), app(LarkEmployeeDirectory::class));

    expect(User::where('first_name', 'UclPhoto')->latest('id')->first()->avatar_path)->toBeNull();
    Http::assertNotSent(fn ($request) => str_contains($request->url(), '/drive/'));
});

test('store() still creates the user when the photo download fails', function () {
    Storage::fake('public');
    uclFakeLarkWithPhoto(500);

    $response = uclController()->store(uclStoreRequest(['use_lark_photo' => true]), app(LarkEmployeeDirectory::class));

    $user = User::where('first_name', 'UclPhoto')->latest('id')->first();
    expect($user)->not->toBeNull();
    expect($user->avatar_path)->toBeNull();
    expect($response->getSession()?->get('warning') ?? session('warning'))->toContain('photo');
});

function uclStoreRequestWithFile(array $overrides, \Illuminate\Http\UploadedFile $file): StoreUserRequest
{
    $request = StoreUserRequest::create('/system/user', 'POST', array_merge([
        'username' => 'ucl_'.uniqid(),
        'employee_id' => '36001',
        'password' => 'Str0ng!Passw0rd#2026',
        'password_confirmation' => 'Str0ng!Passw0rd#2026',
        'first_name' => 'UclPhoto',
        'last_name' => 'Test',
        'email' => 'ucl'.uniqid().'@example.com',
    ], $overrides), [], ['avatar' => $file]);
    $request->setContainer(app())->setRedirector(app('redirect'))->validateResolved();

    return $request;
}

test('store() saves an uploaded avatar, and it wins over the HR photo', function () {
    Storage::fake('public');
    uclFakeLarkWithPhoto();

    $request = uclStoreRequestWithFile(['use_lark_photo' => true], \Illuminate\Http\UploadedFile::fake()->image('me.png', 300, 300));
    uclController()->store($request, app(LarkEmployeeDirectory::class));

    $user = User::where('first_name', 'UclPhoto')->latest('id')->first();
    expect($user->avatar_path)->toStartWith('avatars/')->toEndWith('.png');
    Storage::disk('public')->assertExists($user->avatar_path);
    Http::assertNotSent(fn ($r) => str_contains($r->url(), '/drive/'));
});

test('store() rejects an uploaded avatar over 2MB', function () {
    Storage::fake('public');

    uclStoreRequestWithFile([], \Illuminate\Http\UploadedFile::fake()->image('big.jpg')->size(3000));
})->throws(\Illuminate\Validation\ValidationException::class);
