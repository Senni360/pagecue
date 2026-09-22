"""Provider routing and local-only credential configuration."""
import copy
import json
import os
import threading

BASES = {'openai':'https://api.openai.com/v1/', 'openrouter':'https://openrouter.ai/api/v1/', 'opencode':'https://opencode.ai/zen/v1/', 'jev':'https://api.typesafe.ai/v1/'}
LABELS = {'openai':'OpenAI', 'openrouter':'OpenRouter', 'opencode':'OpenCode Zen', 'jev':'Jev'}


class ProviderRouter:
    def __init__(self, factory, user_error, instructions, path):
        self.factory, self.UserError, self.instructions, self.path = factory, user_error, instructions, path
        self.lock=threading.RLock()
        self.settings={
            'answer_provider':os.environ.get('PAGECUE_PROVIDER','openai'),
            'audio_provider':os.environ.get('PAGECUE_AUDIO_PROVIDER','openai'),
            'openai_model':os.environ.get('PAGECUE_MODEL','gpt-4o-mini'),
            'openrouter_model':os.environ.get('PAGECUE_OPENROUTER_MODEL',''),
            'opencode_model':os.environ.get('PAGECUE_OPENCODE_MODEL','gpt-5.4-mini'),
            'opencode_format':os.environ.get('PAGECUE_OPENCODE_FORMAT','responses'),
            'openai_audio_model':os.environ.get('PAGECUE_TRANSCRIPTION_MODEL','gpt-4o-mini-transcribe'),
            'openrouter_audio_model':os.environ.get('PAGECUE_OPENROUTER_AUDIO_MODEL','openai/whisper-1'),
            'jev_gateway':os.environ.get('PAGECUE_JEV_GATEWAY','typesafe'),
            'jev_model':os.environ.get('PAGECUE_JEV_MODEL','jev-latest'),
            'jev_opencode_model':os.environ.get('PAGECUE_JEV_OPENCODE_MODEL','jev-1.13'),
        }
        if path.is_file():self.settings.update(json.loads(path.read_text(encoding='utf-8')))

    @property
    def answer_provider(self):return self.settings['answer_provider']
    @property
    def audio_provider(self):return self.settings['audio_provider']
    @property
    def model(self):
        if self.answer_provider=='jev' and self.settings['jev_gateway']=='opencode':return self.settings['jev_opencode_model']
        return self.settings.get(self.answer_provider+'_model','')
    @property
    def transcription_model(self):return self.settings.get(self.audio_provider+'_audio_model','')

    def key(self,provider):
        with self.lock:
            if provider=='jev' and self.settings['jev_gateway']=='opencode':return self.key('opencode')
            saved=self.settings.get(provider+'_key','')
            return saved or os.environ.get(provider.upper()+'_API_KEY','') or (os.environ.get('OPENCODE_ZEN_API_KEY','') if provider=='opencode' else os.environ.get('TYPESAFE_API_KEY','') if provider=='jev' else '')

    def check(self,purpose='answer'):
        provider=self.audio_provider if purpose=='audio' else self.answer_provider
        allowed={'openai','openrouter'} if purpose=='audio' else set(BASES)
        if provider not in allowed:raise self.UserError('Choose a supported provider in PageCue Settings.')
        if not self.key(provider):raise self.UserError(f'{LABELS[provider]} API key is missing. Add it in PageCue Settings.')
        model=self.transcription_model if purpose=='audio' else self.model
        if not model.strip():raise self.UserError(f'Choose a {LABELS[provider]} model in PageCue Settings.')

    def public_config(self):
        with self.lock:
            result={k:v for k,v in self.settings.items() if not k.endswith('_key')}
            result['configured_keys']={p:bool(self.key(p)) for p in BASES}
            return result

    def configure(self,data):
        if not isinstance(data,dict):raise self.UserError('Invalid provider settings.')
        with self.lock:
            updated=copy.deepcopy(self.settings)
            for field in ('answer_provider','audio_provider','openai_model','openrouter_model','opencode_model','opencode_format','openai_audio_model','openrouter_audio_model','jev_gateway','jev_model','jev_opencode_model'):
                if field in data:
                    if not isinstance(data[field],str) or len(data[field])>200:raise self.UserError('Invalid '+field)
                    updated[field]=data[field].strip()
            if updated['answer_provider'] not in BASES or updated['audio_provider'] not in {'openai','openrouter'}:raise self.UserError('Unsupported provider.')
            if updated['opencode_format'] not in {'responses','chat'}:raise self.UserError('Choose Responses or Chat Completions for OpenCode.')
            if updated['jev_gateway'] not in {'typesafe','opencode'}:raise self.UserError('Choose TypeSafe direct or OpenCode Zen for Jev.')
            for provider in BASES:
                field=provider+'_key'
                if field in data:
                    value=data[field]
                    if not isinstance(value,str) or len(value)>4096 or '\n' in value or '\r' in value:raise self.UserError('Invalid API key.')
                    if value.strip():updated[field]=value.strip()
            temporary=self.path.with_suffix('.tmp')
            temporary.write_text(json.dumps(updated,indent=2),encoding='utf-8')
            temporary.replace(self.path)
            self.settings=updated

    def client(self,provider):
        client=self.factory()
        client.key=self.key(provider)
        client.base_url=BASES[provider]
        client.label=LABELS[provider]
        client.model=self.settings.get(provider+'_model','')
        client.transcription_model=self.settings.get(provider+'_audio_model','')
        return client

    def ask(self,payload):
        self.check()
        with self.lock:
            provider=self.answer_provider
            client=self.client(provider)
            api_format=self.settings['opencode_format'] if provider=='opencode' else 'responses' if provider=='openai' else 'chat'
            if provider=='jev':
                client.base_url=BASES['opencode'] if self.settings['jev_gateway']=='opencode' else BASES['jev']
                client.model=self.model
        if provider=='jev':
            from jev import build_request, format_result
            request_body=build_request(payload,client.model,self.UserError)
            result=client.call('systemone',json.dumps(request_body,ensure_ascii=False).encode())
            return format_result(result,request_body,self.UserError)
        if api_format=='responses':return client.ask(payload)
        instructions=self.instructions
        if payload.get('context_only'):
            instructions+=' Use only the supplied transcript as factual evidence. Read the question and choices from the screenshot when supplied. If the transcript does not support an answer, say that it cannot be determined from this audio.'
        content=[{'type':'text','text':json.dumps({'question':payload['question'],'transcript':payload.get('context','')},ensure_ascii=False)}]
        if payload.get('image'):content.append({'type':'image_url','image_url':{'url':payload['image']}})
        body={'model':client.model,'messages':[{'role':'system','content':instructions},{'role':'user','content':content}],'max_tokens':1800}
        result=client.call('chat/completions',json.dumps(body).encode())
        choices=result.get('choices') or []
        if not choices:raise self.UserError(f'{client.label} returned no answer.')
        if choices[0].get('finish_reason')=='length':raise self.UserError('The answer was truncated. Choose a smaller question.')
        text=choices[0].get('message',{}).get('content','')
        if isinstance(text,list):text='\n'.join(part.get('text','') for part in text if part.get('type')=='text')
        if not isinstance(text,str) or not text.strip():raise self.UserError(f'{client.label} returned no answer. Check model vision support for screenshot questions.')
        return text.strip()

    def transcribe(self,path):
        self.check('audio')
        with self.lock:client=self.client(self.audio_provider)
        return client.transcribe(path)
