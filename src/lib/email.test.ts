import { describe, it, expect } from 'vitest';
import { emailFormatError, emailSuggestion, emailTypingError, newEmailError } from './email';

describe('emailFormatError', () => {
  it.each([
    'a@b.co',
    'haha@gmail.com',
    'First.Last+shop@Gmail.COM',
    'sales_1@my-shop.co.in',
    "o'neil@example.org",
    '  padded@example.in  ',
    'a@xn--p1ai.xn--p1ai',
  ])('accepts %s', (email) => {
    expect(emailFormatError(email)).toBeNull();
  });

  it.each([
    ['', 'Enter your email'],
    ['haha', 'Add the @'],
    ['haha@', 'after the @'],
    ['haha@gmail', 'Add the ending'],
    ['haha@gmail.', 'Finish the ending'],
    ['haha@gmail.c', 'Finish the ending'],
    ['haha@gmail.12', 'Finish the ending'],
    ['haha@gamsi...som', 'two dots'],
    ['ha..ha@gmail.com', 'two dots'],
    ['ha ha@gmail.com', 'space'],
    ['haha@gmail,com', 'comma'],
    ['ha@ha@gmail.com', 'one @'],
    ['@gmail.com', 'before the @'],
    ['.haha@gmail.com', 'start with a dot'],
    ['haha.@gmail.com', 'just before the @'],
    ['haha@.com', 'name after the @'],
    ['haha@gm_ail.com', 'only letters'],
    ['haha@-gmail.com', 'hyphen'],
    ['haha@gmail-.com', 'hyphen'],
    ['ha(ha@gmail.com', 'character'],
  ])('rejects "%s"', (email, message) => {
    expect(emailFormatError(email)).toContain(message);
  });
});

describe('emailTypingError', () => {
  it.each(['h', 'haha', 'haha@', 'haha@g', 'haha@gmail', 'haha@gmail.', 'haha@gmail.c'])(
    'stays quiet while "%s" could still become a good address',
    (email) => {
      expect(emailTypingError(email)).toBeNull();
    }
  );

  it.each(['haha@gamsi..', 'ha ha', 'ha@ha@', 'haha@gmail,'])('speaks up as soon as "%s" is typed', (email) => {
    expect(emailTypingError(email)).not.toBeNull();
  });
});

describe('emailSuggestion', () => {
  it.each([
    ['a@gmial.com', 'a@gmail.com'],
    ['a@gamil.com', 'a@gmail.com'],
    ['a@gmai.com', 'a@gmail.com'],
    ['a@gmail.co', 'a@gmail.com'],
    ['a@gmail.som', 'a@gmail.com'],
    ['a@GMIAL.com', 'a@gmail.com'],
    ['a@yaho.com', 'a@yahoo.com'],
    ['a@yahoo.co.inn', 'a@yahoo.co.in'],
    ['a@hotmial.com', 'a@hotmail.com'],
    ['a@outlok.com', 'a@outlook.com'],
    ['a@redifmail.com', 'a@rediffmail.com'],
    ['a@gamsi.som', 'a@gamsi.com'],
    ['a@myshop.con', 'a@myshop.com'],
    ['a@myshop.nte', 'a@myshop.net'],
  ])('%s becomes %s', (email, expected) => {
    expect(emailSuggestion(email)).toBe(expected);
  });

  it('keeps what was typed before the @', () => {
    expect(emailSuggestion('First.Last@gmial.com')).toBe('First.Last@gmail.com');
  });

  it.each([
    'a@gmail.com',
    'a@GMAIL.COM',
    'a@ymail.com',
    'a@mail.com',
    'a@email.com',
    'a@yahoo.in',
    'a@me.com',
    'a@live.in',
    'a@myshop.com',
    'a@gail.co.in',
    'a@sharmatraders.in',
  ])('leaves %s alone', (email) => {
    expect(emailSuggestion(email)).toBeNull();
  });

  it('has nothing to say about an address that is still malformed', () => {
    expect(emailSuggestion('a@gmial')).toBeNull();
    expect(emailSuggestion('a@gmial..com')).toBeNull();
  });
});

describe('newEmailError', () => {
  it('stops endings that do not exist', () => {
    expect(newEmailError('a@gamsi.som')).toBe("That ending doesn't look right.");
    expect(newEmailError('a@gmail.con')).toBe("That ending doesn't look right.");
    expect(newEmailError('a@GMAIL.CON')).toBe("That ending doesn't look right.");
  });

  it('passes real endings, including ones that look like slips', () => {
    expect(newEmailError('a@myshop.co')).toBeNull();
    expect(newEmailError('a@myshop.cm')).toBeNull();
    expect(newEmailError('a@myshop.com')).toBeNull();
  });

  it('reports format problems first', () => {
    expect(newEmailError('a@gamsi...som')).toContain('two dots');
    expect(newEmailError('')).toContain('Enter your email');
  });

  it('accepts a fake ending at log in, where the account may already exist', () => {
    expect(emailFormatError('a@gamsi.som')).toBeNull();
  });
});
