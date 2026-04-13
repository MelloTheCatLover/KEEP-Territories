# shared/api

HTTP client and API-related types shared across features.

## Usage

```ts
import { api, setAuthToken, ApiError } from './client';

// After login:
setAuthToken(response.token);

// In any feature:
try {
  const team = await api.get<Team>('/teams/123');
} catch (e) {
  if (e instanceof ApiError && e.status === 401) {
    // handle unauthorized
  }
}
```
