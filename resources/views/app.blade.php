<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">

        <title inertia>{{ config('app.name', 'Laravel') }}</title>

        <link rel="icon" href="/favicon.png" type="image/png">

        <link rel="preconnect" href="https://fonts.bunny.net">
        <link href="https://fonts.bunny.net/css?family=roboto:300,400,500,700,900|sarabun:300,400,500,600,700,800" rel="stylesheet" />

        {{-- UI5's starting language. Without it UI5 boots in English and
             ThemedPage's setLanguage() turns into a live language change while
             the page mounts; a Dialog/Popover connected during that change is
             rendered before UI5 adds its `popover` attribute, so every closed
             dialog showed up stacked at the top-left on load. --}}
        <script data-ui5-config type="application/json">{"language": @json(app()->getLocale())}</script>

        @routes
        @viteReactRefresh
        @vite(['resources/js/app.tsx', "resources/js/pages/{$page['component']}.tsx"])
        @inertiaHead
    </head>
    <body class="font-sans antialiased">
        @inertia
    </body>
</html>
