<?php

use App\Http\Controllers\ImportExport\ExportConfigController;
use App\Http\Controllers\ImportExport\ImportConfigController;
use App\Http\Controllers\ImportExport\JobTrackerController;
use App\Http\Controllers\ImportExport\WooCommerceConversionController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth'])->prefix('import-export')->name('importExport.')->group(function () {
    Route::get('imports', [ImportConfigController::class, 'index'])->name('imports.index')->middleware('permission:import_configs,list_import_configs');
    Route::get('imports/create', [ImportConfigController::class, 'create'])->name('imports.create')->middleware('permission:import_configs,create_import_configs');
    Route::post('imports', [ImportConfigController::class, 'store'])->name('imports.store')->middleware('permission:import_configs,create_import_configs');
    Route::get('imports/sample/{type}', [ImportConfigController::class, 'sample'])->name('imports.sample')->middleware('permission:import_configs,list_import_configs');
    Route::get('imports/{importConfig}/edit', [ImportConfigController::class, 'edit'])->name('imports.edit')->middleware('permission:import_configs,edit_import_configs');
    Route::put('imports/{importConfig}', [ImportConfigController::class, 'update'])->name('imports.update')->middleware('permission:import_configs,edit_import_configs');
    Route::put('imports/{importConfig}/edit', [ImportConfigController::class, 'update'])->middleware('permission:import_configs,edit_import_configs');
    Route::delete('imports/{importConfig}', [ImportConfigController::class, 'destroy'])->name('imports.destroy')->middleware('permission:import_configs,delete_import_configs');
    Route::post('imports/{importConfig}/run', [ImportConfigController::class, 'run'])->name('imports.run')->middleware('permission:import_configs,edit_import_configs');

    Route::get('exports', [ExportConfigController::class, 'index'])->name('exports.index')->middleware('permission:export_configs,list_export_configs');
    Route::get('exports/create', [ExportConfigController::class, 'create'])->name('exports.create')->middleware('permission:export_configs,create_export_configs');
    Route::post('exports', [ExportConfigController::class, 'store'])->name('exports.store')->middleware('permission:export_configs,create_export_configs');
    Route::get('exports/{exportConfig}/edit', [ExportConfigController::class, 'edit'])->name('exports.edit')->middleware('permission:export_configs,edit_export_configs');
    Route::put('exports/{exportConfig}', [ExportConfigController::class, 'update'])->name('exports.update')->middleware('permission:export_configs,edit_export_configs');
    Route::put('exports/{exportConfig}/edit', [ExportConfigController::class, 'update'])->middleware('permission:export_configs,edit_export_configs');
    Route::delete('exports/{exportConfig}', [ExportConfigController::class, 'destroy'])->name('exports.destroy')->middleware('permission:export_configs,delete_export_configs');
    Route::post('exports/{exportConfig}/run', [ExportConfigController::class, 'run'])->name('exports.run')->middleware('permission:export_configs,edit_export_configs');

    Route::get('jobs', [JobTrackerController::class, 'index'])->name('jobs.index')->middleware('permission:job_trackers,list_job_trackers');
    Route::get('jobs/{jobTracker}', [JobTrackerController::class, 'show'])->name('jobs.show')->middleware('permission:job_trackers,list_job_trackers');
    Route::get('jobs/{jobTracker}/status', [JobTrackerController::class, 'status'])->name('jobs.status')->middleware('permission:job_trackers,list_job_trackers');
    Route::post('jobs/{jobTracker}/cancel', [JobTrackerController::class, 'cancel'])->name('jobs.cancel')->middleware('permission:job_trackers,list_job_trackers');
    Route::get('jobs/{jobTracker}/download', [JobTrackerController::class, 'download'])->name('jobs.download')->middleware('permission:job_trackers,list_job_trackers');

    Route::get('woo-convert', [WooCommerceConversionController::class, 'index'])->name('wooConvert.index')->middleware('permission:woo_conversions,list_woo_conversions');
    Route::get('woo-convert/create', [WooCommerceConversionController::class, 'create'])->name('wooConvert.create')->middleware('permission:woo_conversions,create_woo_conversions');
    Route::get('woo-convert/export', [WooCommerceConversionController::class, 'exportForm'])->name('wooConvert.exportForm')->middleware('permission:woo_conversions,list_woo_conversions');
    Route::get('woo-convert/export/download', [WooCommerceConversionController::class, 'export'])->name('wooConvert.export')->middleware('permission:woo_conversions,create_woo_conversions');
    Route::post('woo-convert', [WooCommerceConversionController::class, 'convert'])->name('wooConvert.convert')->middleware('permission:woo_conversions,create_woo_conversions');
    Route::get('woo-convert/{wooConversion}', [WooCommerceConversionController::class, 'show'])->name('wooConvert.show')->middleware('permission:woo_conversions,list_woo_conversions');
    Route::get('woo-convert/{wooConversion}/download', [WooCommerceConversionController::class, 'download'])->name('wooConvert.download')->middleware('permission:woo_conversions,list_woo_conversions');
    Route::get('woo-convert/{wooConversion}/download-xlsx', [WooCommerceConversionController::class, 'downloadXlsx'])->name('wooConvert.downloadXlsx')->middleware('permission:woo_conversions,list_woo_conversions');
    Route::get('woo-convert/{wooConversion}/download-unmatched', [WooCommerceConversionController::class, 'downloadUnmatched'])->name('wooConvert.downloadUnmatched')->middleware('permission:woo_conversions,list_woo_conversions');
});
