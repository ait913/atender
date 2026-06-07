# Atender iOS

## Build

```sh
cd apps/ios
/opt/homebrew/bin/xcodegen generate
xcodebuild -project Atender.xcodeproj -scheme Atender -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 16' build
```

## Test

```sh
cd apps/ios
xcodebuild -project Atender.xcodeproj -scheme Atender -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 16' test
```

## Scheme

- Scheme: `Atender`
- App target: `Atender`
- Unit test target: `AtenderTests`

## API Base URL

`Debug.xcconfig` and `Release.xcconfig` set `ATENDER_API_BASE_URL`.

- Debug: `http://localhost:8787`
- Release: `https://atender-api.appily.run`

The URL is split into scheme and host in xcconfig files because `//` is parsed as a comment marker there.
