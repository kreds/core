export interface KredsComponentBase {
  id: string;
  type: 'input' | 'submit' | 'link' | 'text' | 'paragraph';
}

export interface KredsComponentInput extends KredsComponentBase {
  type: 'input';
  name: string;
  inputType: 'text' | 'password';
  label: string;
}

export interface KredsComponentSubmit extends KredsComponentBase {
  type: 'submit';
  label: string;
}

export interface KredsComponentLink extends KredsComponentBase {
  type: 'link';
  href: string;
  label: string;
}

export interface KredsComponentText extends KredsComponentBase {
  type: 'text';
  label: string;
}

export interface KredsComponentParagraph extends KredsComponentBase {
  type: 'paragraph';
  children: (KredsComponentLink | KredsComponentText)[];
  mode?: 'default' | 'warning' | 'success' | 'error';
}

export type KredsComponent =
  | KredsComponentInput
  | KredsComponentSubmit
  | KredsComponentLink
  | KredsComponentText
  | KredsComponentParagraph;

export interface KredsClientActionBase {
  type: 'render' | 'redirect';
}

export interface KredsClientActionRender extends KredsClientActionBase {
  type: 'render';
  payload: KredsComponent[];
}

export interface KredsClientActionRedirect extends KredsClientActionBase {
  type: 'redirect';
  url: string;
}

export type KredsClientAction =
  | KredsClientActionRedirect
  | KredsClientActionRender;
