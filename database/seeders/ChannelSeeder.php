<?php

namespace Database\Seeders;

use App\Models\Channel;
use App\Models\ChannelTranslation;
use App\Models\Currency;
use App\Models\Locale;
use Illuminate\Database\Seeder;

class ChannelSeeder extends Seeder
{
    /**
     * Seed the single "web" sales channel, scoped to the th/en locales and
     * THB, so products have somewhere to belong before any storefront values
     * can be scoped by channel.
     */
    public function run(): void
    {
        $channel = Channel::updateOrCreate(['code' => 'web']);

        $names = ['th' => 'เว็บไซต์หลัก', 'en' => 'Main Website'];

        foreach ($names as $code => $name) {
            $localeId = Locale::where('code', $code)->value('id');

            if ($localeId) {
                ChannelTranslation::updateOrCreate(
                    ['channel_id' => $channel->id, 'locale_id' => $localeId],
                    ['name' => $name]
                );
            }
        }

        $channel->locales()->sync(Locale::whereIn('code', array_keys($names))->pluck('id'));
        $channel->currencies()->sync(Currency::where('code', 'THB')->pluck('id'));
    }
}
