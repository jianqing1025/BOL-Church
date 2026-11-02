// The single-church (BOLCCOP) Worker's entry. Everything lives in finance.ts;
// this file exports nothing else, because the Workers runtime treats every
// export of the entry module as an entry point and refuses the rest.
export { default } from './finance';
