import { redact, redactString, REDACTION_PLACEHOLDER } from './redaction';

describe('redactString', () => {
  it('masks GitHub personal access tokens', () => {
    const token = 'ghp_' + 'A'.repeat(36);
    const out = redactString(`token is ${token} end`);
    expect(out).toContain(REDACTION_PLACEHOLDER);
    expect(out).not.toContain(token);
  });

  it('masks fine-grained GitHub PATs (github_pat_…)', () => {
    const token = 'github_pat_' + 'b'.repeat(40);
    const out = redactString(token);
    expect(out).not.toContain(token);
    expect(out).toBe(REDACTION_PLACEHOLDER);
  });

  it('masks Slack tokens', () => {
    const token = 'xoxb-' + '1234567890-abcdefghij';
    const out = redactString(`slack=${token}`);
    expect(out).not.toContain(token);
  });

  it('masks JSON Web Tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.abcDEF123-_';
    const out = redactString(`Cookie: jwt=${jwt}`);
    expect(out).not.toContain(jwt);
  });

  it('masks Bearer authorization headers but keeps the label', () => {
    const out = redactString('Authorization: Bearer sk-secret-value-123');
    expect(out).toContain('Authorization: Bearer');
    expect(out).toContain(REDACTION_PLACEHOLDER);
    expect(out).not.toContain('sk-secret-value-123');
  });

  it('masks bare Bearer tokens without a header name', () => {
    const out = redactString('sent Bearer abcdef0123456789 to server');
    expect(out).toContain('Bearer');
    expect(out).not.toContain('abcdef0123456789');
  });

  it('masks Basic auth credentials', () => {
    const out = redactString('Authorization: Basic dXNlcjpwYXNzd29yZA==');
    expect(out).not.toContain('dXNlcjpwYXNzd29yZA==');
    expect(out).toContain(REDACTION_PLACEHOLDER);
  });

  it('masks token/api_key/password in query strings and form bodies', () => {
    const out = redactString('GET /x?api_key=ABC123secret&token=zzz999&q=hi');
    expect(out).not.toContain('ABC123secret');
    expect(out).not.toContain('zzz999');
    expect(out).toContain('q=hi');
    expect(out).toContain('api_key=');
    expect(out).toContain('token=');
  });

  it('masks access_token form fields', () => {
    const out = redactString('access_token=verysecretvalue&grant_type=code');
    expect(out).not.toContain('verysecretvalue');
    expect(out).toContain('grant_type=code');
  });

  it('masks credentials embedded in a URL while keeping structure', () => {
    const out = redactString('clone https://user:supersecret@github.com/o/r.git');
    expect(out).not.toContain('supersecret');
    expect(out).toContain('user:');
    expect(out).toContain('@github.com');
  });

  it('masks caller-supplied known literal values verbatim', () => {
    const out = redactString('the value is plainword42 right here', ['plainword42']);
    expect(out).not.toContain('plainword42');
    expect(out).toContain(REDACTION_PLACEHOLDER);
  });

  it('masks the longest known value first to avoid partial leaks', () => {
    const out = redactString('abc and abcdef', ['abc', 'abcdef']);
    expect(out).not.toContain('abcdef');
    expect(out.split(REDACTION_PLACEHOLDER).length - 1).toBe(2);
  });

  it('ignores empty known values', () => {
    const out = redactString('nothing sensitive', ['']);
    expect(out).toBe('nothing sensitive');
  });

  it('leaves non-secret text untouched', () => {
    const text = 'just a normal sentence with numbers 42 and words';
    expect(redactString(text)).toBe(text);
  });
});

describe('redact (deep)', () => {
  it('masks values of sensitive-named keys regardless of shape', () => {
    const input = {
      username: 'alice',
      password: 'hunter2',
      apiKey: 'k-123',
      access_token: 'tok',
      nested: { clientSecret: { weird: 'shape' } },
    };
    const out = redact(input);
    expect(out.username).toBe('alice');
    expect(out.password).toBe(REDACTION_PLACEHOLDER);
    expect(out.apiKey).toBe(REDACTION_PLACEHOLDER);
    expect(out.access_token).toBe(REDACTION_PLACEHOLDER);
    expect(out.nested.clientSecret).toBe(REDACTION_PLACEHOLDER);
  });

  it('does not mutate the original object', () => {
    const input = { password: 'p' };
    redact(input);
    expect(input.password).toBe('p');
  });

  it('walks arrays and redacts string members', () => {
    const token = 'ghp_' + 'X'.repeat(36);
    const out = redact(['plain', token, { token: 'inner' }]);
    expect(out[0]).toBe('plain');
    expect(out[1]).not.toContain(token);
    expect((out[2] as { token: string }).token).toBe(REDACTION_PLACEHOLDER);
  });

  it('handles a DOM/network-like captured payload', () => {
    const captured = {
      request: {
        url: 'https://api.example.com/v1/data',
        headers: { Authorization: 'Bearer abc.def.ghi', 'content-type': 'application/json' },
        body: 'api_key=topsecret&other=ok',
      },
      dom: '<input name="token" value="leaked-token-value"/>',
    };
    const out = redact(captured, ['leaked-token-value']);
    expect(out.request.headers.Authorization).toBe(REDACTION_PLACEHOLDER);
    expect(out.request.headers['content-type']).toBe('application/json');
    expect(out.request.body).not.toContain('topsecret');
    expect(out.dom).not.toContain('leaked-token-value');
  });

  it('returns primitives and null unchanged', () => {
    expect(redact(42)).toBe(42);
    expect(redact(true)).toBe(true);
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
  });

  it('handles circular references safely', () => {
    const a: Record<string, unknown> = { name: 'x' };
    a.self = a;
    const out = redact(a) as Record<string, unknown>;
    expect(out.name).toBe('x');
    expect(out.self).toBe('[Circular]');
  });
});
