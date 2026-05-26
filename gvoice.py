#!/usr/bin/env python3
"""Minimal Google Voice SMS sender via cookie auth"""

import requests, hashlib, time, sys, os, json

SID = os.environ.get('GVOICE_SID', '')
PHONE = os.environ.get('PHONE', '+19362300683')

def send(phone_number, text):
    ts = int(time.time())
    sapisid_hash = hashlib.sha1(f"{ts} {SID}".encode()).hexdigest()
    
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
        'Authorization': f'SAPISIDHASH {ts}_{sapisid_hash}',
        'X-Goog-AuthUser': '0',
        'X-Origin': 'https://voice.google.com',
        'Origin': 'https://voice.google.com',
        'Referer': 'https://voice.google.com/',
    })
    session.cookies.set('__Secure-3PSID', SID, domain='.google.com', secure=True)

    rn = str(int(time.time() * 1000))
    r = session.post(
        'https://voice.google.com/sendSms',
        params={'rn': rn, 'authuser': '0'},
        json={'phoneNumber': phone_number, 'text': text},
        timeout=30
    )
    return r.status_code, r.text[:500]

if __name__ == '__main__':
    if not SID:
        print("Error: Set GVOICE_SID env var (__Secure-3PSID cookie value)")
        sys.exit(1)
    phone = sys.argv[1] if len(sys.argv) > 1 else PHONE
    text = sys.argv[2] if len(sys.argv) > 2 else 'Test from da she'
    status, body = send(phone, text)
    print(f"Status: {status}")
    print(f"Body: {body}")
