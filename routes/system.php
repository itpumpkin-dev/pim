<?php

use App\Http\Controllers\System\RoleController;
use App\Http\Controllers\System\UserController;
use App\Http\Controllers\System\UserGroupController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth'])->prefix('system')->name('system.')->group(function () {
    Route::get('user', [UserController::class, 'index'])->name('user.index')->middleware('permission:users,list_users');
    Route::get('user/summary', [UserController::class, 'summary'])->name('user.summary')->middleware('permission:users,list_users');
    Route::get('user/{user}/summary', [UserController::class, 'summaryShow'])->name('user.summary.show')->middleware('permission:users,list_users');
    Route::post('user', [UserController::class, 'store'])->name('user.store')->middleware('permission:users,create_users');
    Route::get('user/{user}/edit', [UserController::class, 'edit'])->name('user.edit')->middleware('permission:users,edit_users');
    Route::put('user/{user}', [UserController::class, 'update'])->name('user.update')->middleware('permission:users,edit_users');
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
});
