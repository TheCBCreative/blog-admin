import { useState } from 'react';
import { createAuthClient } from '@thecbcreative/blog-admin/client';

const authClient = createAuthClient();

interface Props {
  next: string;
  demoEmail: string;
  demoPassword: string;
}

export default function LoginForm({ next, demoEmail, demoPassword }: Props) {
  const [email, setEmail] = useState(demoEmail);
  const [password, setPassword] = useState(demoPassword);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await authClient.signIn(email, password);
    setLoading(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    window.location.href = next;
  }

  return (
    <form onSubmit={onSubmit}>
      {error && <div className="form-error">{error}</div>}

      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
        />
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>

      <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
