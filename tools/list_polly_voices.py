"""
List Amazon Polly voices (requires AWS credentials configured in environment or config files).
Usage:
  pip install boto3
  python tools/list_polly_voices.py
"""
import boto3

def main():
    client = boto3.client('polly')
    resp = client.describe_voices()
    voices = resp.get('Voices', [])
    print(f"Found {len(voices)} voices")
    for v in voices:
        print(f"{v.get('Id')}\tLanguage={v.get('LanguageCode')}\tName={v.get('Name')}\tGender={v.get('Gender')}")

if __name__ == '__main__':
    main()
