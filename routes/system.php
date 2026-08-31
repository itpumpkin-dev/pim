<?php

use App\Http\Controllers\System\ActivityLogController;
use App\Http\Controllers\System\DepartmentController;
use App\Http\Controllers\System\JobPositionController;
use App\Http\Controllers\System\LocaleController;
use App\Http\Controllers\System\LocaleTranslationController;
use App\Http\Controllers\System\RoleController;
use App\Http\Controllers\System\TranslationProviderController;
use App\Http\Controllers\System\UserController;
use App\Http\Controllers\System\UserGroupController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth'])->prefix('system')->name('system.')->group(function () {
    Route::get('activity-logs', [ActivityLogController::class, 'index'])->name('activityLogs.index')->middleware('permission:activity_logs,list_activity_logs');

    Route::get('user', [UserController::class, 'index'])->name('user.index')->middleware('permission:users,list_users');
    Route::get('user/summary', [UserController::class, 'summary'])->name('user.summary')->middleware('permission:users,list_users');
    Route::get('user/{user}/summary', [UserController::class, 'summaryShow'])->name('user.summary.show')->middleware('permission:users,list_users');
    Route::post('user', [UserController::class, 'store'])->name('user.store')->middleware('permission:users,create_users');
    // No permission middleware here: a user is always allowed to view/edit their own
    // account (this is also the "Settings" page). UserController enforces that anyone
    // other than the account owner needs the `users.edit_users` permission, and that
    // only holders of that permission may change enabled/groups/roles.
    Route::get('user/{user}/edit', [UserController::class, 'edit'])->name('user.edit');
    Route::get('user/{user}/history', [UserController::class, 'history'])->name('user.history');
    Route::put('user/{user}', [UserController::class, 'update'])->name('user.update');
    // Group/role assignment saves independently from the main profile form (the
    // "Groups and Roles" tab has its own Save). Strictly a manager action, so —
    // unlike the self-service edit/update routes above — it is permission-gated.
    Route::put('user/{user}/access', [UserController::class, 'updateAccess'])->name('user.updateAccess')->middleware('permission:users,edit_users');
    Route::delete('user/{user}', [UserController::class, 'destroy'])->name('user.destroy')->middleware('permission:users,delete_users');

    Route::get('userGroup', [UserGroupController::class, 'index'])->name('userGroup.index')->middleware('permission:user_groups,list_user_groups');
    Route::get('userGroup/create', [UserGroupController::class, 'create'])->name('userGroup.create')->middleware('permission:user_groups,create_user_groups');
    Route::post('userGroup', [UserGroupController::class, 'store'])->name('userGroup.store')->middleware('permission:user_groups,create_user_groups');
    Route::get('userGroup/{userGroup}/edit', [UserGroupController::class, 'edit'])->name('userGroup.edit')->middleware('permission:user_groups,edit_user_groups');
    Route::put('userGroup/{userGroup}', [UserGroupController::class, 'update'])->name('userGroup.update')->middleware('permission:user_groups,edit_user_groups');
    Route::delete('userGroup/{userGroup}', [UserGroupController::class, 'destroy'])->name('userGroup.destroy')->middleware('permission:user_groups,delete_user_groups');

    Route::get('roles', [RoleController::class, 'index'])->name('roles.index')->middleware('permission:roles,list_roles');
    Route::get('roles/create', [RoleController::class, 'create'])->name('roles.create')->middleware('permission:roles,create_roles');
    Route::post('roles', [RoleController::class, 'store'])->name('roles.store')->middleware('permission:roles,create_roles');
    Route::get('roles/{role}/edit', [RoleController::class, 'edit'])->name('roles.edit')->middleware('permission:roles,edit_roles');
    Route::put('roles/{role}', [RoleController::class, 'update'])->name('roles.update')->middleware('permission:roles,edit_roles');
    Route::delete('roles/{role}', [RoleController::class, 'destroy'])->name('roles.destroy')->middleware('permission:roles,delete_roles');

    Route::get('department', [DepartmentController::class, 'index'])->name('department.index')->middleware('permission:departments,list_departments');
    Route::get('department/create', [DepartmentController::class, 'create'])->name('department.create')->middleware('permission:departments,create_departments');
    Route::post('department', [DepartmentController::class, 'store'])->name('department.store')->middleware('permission:departments,create_departments');
    Route::get('department/{department}/edit', [DepartmentController::class, 'edit'])->name('department.edit')->middleware('permission:departments,edit_departments');
    Route::put('department/{department}', [DepartmentController::class, 'update'])->name('department.update')->middleware('permission:departments,edit_departments');
    Route::delete('department/{department}', [DepartmentController::class, 'destroy'])->name('department.destroy')->middleware('permission:departments,delete_departments');

    Route::get('jobPosition', [JobPositionController::class, 'index'])->name('jobPosition.index')->middleware('permission:job_positions,list_job_positions');
    Route::get('jobPosition/create', [JobPositionController::class, 'create'])->name('jobPosition.create')->middleware('permission:job_positions,create_job_positions');
    Route::post('jobPosition', [JobPositionController::class, 'store'])->name('jobPosition.store')->middleware('permission:job_positions,create_job_positions');
    Route::get('jobPosition/{jobPosition}/edit', [JobPositionController::class, 'edit'])->name('jobPosition.edit')->middleware('permission:job_positions,edit_job_positions');
    Route::put('jobPosition/{jobPosition}', [JobPositionController::class, 'update'])->name('jobPosition.update')->middleware('permission:job_positions,edit_job_positions');
    Route::delete('jobPosition/{jobPosition}', [JobPositionController::class, 'destroy'])->name('jobPosition.destroy')->middleware('permission:job_positions,delete_job_positions');

    Route::get('locales', [LocaleController::class, 'index'])->name('locales.index')->middleware('permission:locales,list_locales');
    Route::get('locales/create', [LocaleController::class, 'create'])->name('locales.create')->middleware('permission:locales,create_locales');
    Route::post('locales', [LocaleController::class, 'store'])->name('locales.store')->middleware('permission:locales,create_locales');
    Route::get('locales/{locale}/edit', [LocaleController::class, 'edit'])->name('locales.edit')->middleware('permission:locales,edit_locales');
    Route::put('locales/{locale}', [LocaleController::class, 'update'])->name('locales.update')->middleware('permission:locales,edit_locales');
    Route::delete('locales/{locale}', [LocaleController::class, 'destroy'])->name('locales.destroy')->middleware('permission:locales,delete_locales');
    Route::post('locales/{locale}/translate', [LocaleController::class, 'translate'])->name('locales.translate')->middleware('permission:locales,edit_locales');
    Route::get('locales/{locale}/translations', [LocaleTranslationController::class, 'edit'])->name('locales.translations.edit')->middleware('permission:locales,edit_locales');
    Route::put('locales/{locale}/translations', [LocaleTranslationController::class, 'update'])->name('locales.translations.update')->middleware('permission:locales,edit_locales');
    Route::post('locales/{locale}/translations/queue-missing', [LocaleTranslationController::class, 'queueMissingContent'])->name('locales.translations.queueMissing')->middleware('permission:locales,edit_locales');
    Route::post('locales/{locale}/translations/queue-one', [LocaleTranslationController::class, 'queueOneContent'])->name('locales.translations.queueOne')->middleware('permission:locales,edit_locales');

    Route::get('translationProviders', [TranslationProviderController::class, 'index'])->name('translationProviders.index')->middleware('permission:translation_providers,list_translation_providers');
    Route::get('translationProviders/create', [TranslationProviderController::class, 'create'])->name('translationProviders.create')->middleware('permission:translation_providers,create_translation_providers');
    Route::get('translationProviders/field-options', [TranslationProviderController::class, 'fieldOptions'])->name('translationProviders.fieldOptions')->middleware('permission:translation_providers,create_translation_providers');
    Route::post('translationProviders', [TranslationProviderController::class, 'store'])->name('translationProviders.store')->middleware('permission:translation_providers,create_translation_providers');
    Route::get('translationProviders/{translationProvider}/edit', [TranslationProviderController::class, 'edit'])->name('translationProviders.edit')->middleware('permission:translation_providers,edit_translation_providers');
    Route::put('translationProviders/{translationProvider}', [TranslationProviderController::class, 'update'])->name('translationProviders.update')->middleware('permission:translation_providers,edit_translation_providers');
    Route::delete('translationProviders/{translationProvider}', [TranslationProviderController::class, 'destroy'])->name('translationProviders.destroy')->middleware('permission:translation_providers,delete_translation_providers');
    Route::post('translationProviders/{translationProvider}/test', [TranslationProviderController::class, 'test'])->name('translationProviders.test')->middleware('permission:translation_providers,edit_translation_providers');
});
