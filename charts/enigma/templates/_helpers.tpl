{{- define "enigma.labels" -}}
app.kubernetes.io/name: enigma
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}

{{- define "enigma.secretName" -}}
{{ .Values.existingSecret | default .Release.Name }}
{{- end }}

{{- define "enigma.securityContext" -}}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities: { drop: [ALL] }
{{- end }}
