import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Button,
  TextField,
  Typography,
  IconButton,
  Stack,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Divider,
  Card,
  CardContent,
  Collapse,
  Tooltip,
  alpha,
  useTheme,
  useMediaQuery,
  InputAdornment,
} from '@mui/material';
import {
  Close as CloseIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  DragIndicator as DragIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  ShortText as ShortTextIcon,
  Subject as SubjectIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  Numbers as NumbersIcon,
  RadioButtonChecked as RadioIcon,
  CheckBox as CheckBoxIcon,
  ArrowDropDown as SelectIcon,
} from '@mui/icons-material';

const FormBlockCreator = ({ open, onClose, onSave }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [formName, setFormName] = useState('');
  const [fields, setFields] = useState([]);
  const [expandedField, setExpandedField] = useState(null);

  const fieldTypes = [
    { value: 'text', label: 'Short Text', icon: <ShortTextIcon fontSize="small" />, description: 'Single line input' },
    { value: 'textarea', label: 'Long Text', icon: <SubjectIcon fontSize="small" />, description: 'Multi-line text area' },
    { value: 'email', label: 'Email', icon: <EmailIcon fontSize="small" />, description: 'Email address' },
    { value: 'tel', label: 'Phone', icon: <PhoneIcon fontSize="small" />, description: 'Phone number' },
    { value: 'number', label: 'Number', icon: <NumbersIcon fontSize="small" />, description: 'Numeric input' },
    { value: 'radio', label: 'Single Choice', icon: <RadioIcon fontSize="small" />, description: 'Choose one option' },
    { value: 'checkbox', label: 'Multiple Choice', icon: <CheckBoxIcon fontSize="small" />, description: 'Choose multiple options' },
    { value: 'select', label: 'Dropdown', icon: <SelectIcon fontSize="small" />, description: 'Select from dropdown' },
  ];

  const addField = () => {
    const newField = {
      id: Date.now(),
      key: `field_${fields.length}`,
      label: '',
      type: 'text',
      placeholder: '',
      required: false,
      options: [],
      minSelections: 1,
      maxSelections: undefined,
    };
    setFields([...fields, newField]);
    setExpandedField(newField.id);
  };

  const updateField = (id, updates) => {
    setFields(fields.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const deleteField = (id) => {
    setFields(fields.filter(f => f.id !== id));
    if (expandedField === id) setExpandedField(null);
  };

  const addOption = (fieldId) => {
    updateField(fieldId, {
      options: [...(fields.find(f => f.id === fieldId)?.options || []), '']
    });
  };

  const updateOption = (fieldId, optionIndex, value) => {
    const field = fields.find(f => f.id === fieldId);
    const newOptions = [...field.options];
    newOptions[optionIndex] = value;
    updateField(fieldId, { options: newOptions });
  };

  const deleteOption = (fieldId, optionIndex) => {
    const field = fields.find(f => f.id === fieldId);
    const newOptions = field.options.filter((_, i) => i !== optionIndex);
    updateField(fieldId, { options: newOptions });
  };

  const handleSave = () => {
    if (!formName.trim()) {
      alert('Please enter a form name');
      return;
    }

    if (fields.length === 0) {
      alert('Please add at least one field');
      return;
    }

    // Validate fields
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      if (!field.label.trim()) {
        alert(`Field ${i + 1} is missing a label`);
        return;
      }
      if (['radio', 'checkbox', 'select'].includes(field.type)) {
        if (!field.options || field.options.length === 0) {
          alert(`Field "${field.label}" requires at least one option`);
          return;
        }
        const validOptions = field.options.filter(opt => opt.trim());
        if (validOptions.length === 0) {
          alert(`Field "${field.label}" has no valid options`);
          return;
        }
      }
    }

    onSave({
      name: formName,
      type: 'form',
      fields: fields.map(({ id, ...field }) => field)
    });

    // Reset form
    setFormName('');
    setFields([]);
    setExpandedField(null);
  };

  const getFieldIcon = (type) => {
    return fieldTypes.find(ft => ft.value === type)?.icon || <ShortTextIcon fontSize="small" />;
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: {
          borderRadius: { xs: 0, sm: 3 },
          maxHeight: { xs: '100%', sm: '90vh' }
        }
      }}
    >
      <DialogTitle sx={{ p: 3, pb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography sx={{ fontSize: 22, fontWeight: 700, fontFamily: 'Inter' }}>
            Create Form Block
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 3, pt: 0 }}>
        <Stack spacing={3} mt={1}>
          {/* Form Name */}
          <TextField
            fullWidth
            label="Form Name"
            placeholder="e.g., Contact Form, Survey, Registration"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                fontFamily: 'Inter',
              }
            }}
          />

          <Divider />

          {/* Fields List */}
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography sx={{ fontSize: 16, fontWeight: 600, fontFamily: 'Inter' }}>
                Form Fields ({fields.length})
              </Typography>
              <Button
                startIcon={<AddIcon />}
                onClick={addField}
                variant="contained"
                sx={{
                  textTransform: 'none',
                  fontFamily: 'Inter',
                  fontWeight: 600,
                  borderRadius: 2,
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                }}
              >
                Add Field
              </Button>
            </Box>

            {fields.length === 0 ? (
              <Card
                sx={{
                  borderRadius: 2,
                  border: '2px dashed #E5E7EB',
                  bgcolor: '#F9FAFB',
                  textAlign: 'center',
                  py: 4
                }}
              >
                <Typography sx={{ color: '#6B7280', fontFamily: 'Inter', mb: 2 }}>
                  No fields added yet
                </Typography>
                <Button
                  startIcon={<AddIcon />}
                  onClick={addField}
                  variant="outlined"
                  sx={{
                    textTransform: 'none',
                    fontFamily: 'Inter',
                    fontWeight: 600,
                    borderRadius: 2,
                  }}
                >
                  Add Your First Field
                </Button>
              </Card>
            ) : (
              <Stack spacing={2}>
                {fields.map((field, index) => (
                  <Card
                    key={field.id}
                    sx={{
                      borderRadius: 2,
                      border: '1px solid #E5E7EB',
                      overflow: 'hidden',
                      transition: 'all 0.2s',
                      '&:hover': {
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                        borderColor: '#667eea',
                      }
                    }}
                  >
                    {/* Field Header */}
                    <Box
                      onClick={() => setExpandedField(expandedField === field.id ? null : field.id)}
                      sx={{
                        p: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        bgcolor: expandedField === field.id ? alpha('#667eea', 0.05) : 'transparent',
                        '&:hover': {
                          bgcolor: alpha('#667eea', 0.08)
                        }
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                        <Box
                          sx={{
                            width: 36,
                            height: 36,
                            borderRadius: 1.5,
                            bgcolor: alpha('#667eea', 0.1),
                            display: 'grid',
                            placeItems: 'center',
                            color: '#667eea'
                          }}
                        >
                          {getFieldIcon(field.type)}
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography
                            sx={{
                              fontSize: 15,
                              fontWeight: 600,
                              fontFamily: 'Inter',
                              color: '#1F2937',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {field.label || `Field ${index + 1}`}
                          </Typography>
                          <Typography
                            sx={{
                              fontSize: 12,
                              color: '#6B7280',
                              fontFamily: 'Inter'
                            }}
                          >
                            {fieldTypes.find(ft => ft.value === field.type)?.label || field.type}
                            {field.required && ' • Required'}
                          </Typography>
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteField(field.id);
                          }}
                          sx={{
                            color: '#EF4444',
                            '&:hover': { bgcolor: alpha('#EF4444', 0.1) }
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small">
                          {expandedField === field.id ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                      </Box>
                    </Box>

                    {/* Field Editor */}
                    <Collapse in={expandedField === field.id}>
                      <Box sx={{ p: 3, pt: 2, bgcolor: '#F9FAFB', borderTop: '1px solid #E5E7EB' }}>
                        <Stack spacing={2.5}>
                          {/* Question/Label - Now with multiline support */}
                          <TextField
                            fullWidth
                            multiline
                            minRows={2}
                            maxRows={4}
                            label="Question / Label"
                            placeholder="e.g., When did you start fitness training and what kind of food do you consume?"
                            value={field.label}
                            onChange={(e) => updateField(field.id, { label: e.target.value })}
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                borderRadius: 2,
                                fontFamily: 'Inter',
                                bgcolor: '#fff'
                              }
                            }}
                          />

                          {/* Field Type Selector - Modern Card-based UI */}
                          <Box>
                            <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 1.5, fontFamily: 'Inter', color: '#374151' }}>
                              Field Type
                            </Typography>
                            <Box
                              sx={{
                                display: 'grid',
                                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
                                gap: 1.5
                              }}
                            >
                              {fieldTypes.map((ft) => (
                                <Tooltip key={ft.value} title={ft.description} placement="top">
                                  <Card
                                    onClick={() => {
                                      updateField(field.id, { type: ft.value });
                                      // Reset options if changing away from option-based type
                                      if (!['radio', 'checkbox', 'select'].includes(ft.value)) {
                                        updateField(field.id, { options: [] });
                                      }
                                    }}
                                    sx={{
                                      p: 1.5,
                                      cursor: 'pointer',
                                      border: field.type === ft.value ? '2px solid #667eea' : '1px solid #E5E7EB',
                                      bgcolor: field.type === ft.value ? alpha('#667eea', 0.05) : '#fff',
                                      transition: 'all 0.2s',
                                      '&:hover': {
                                        borderColor: '#667eea',
                                        transform: 'translateY(-2px)',
                                        boxShadow: '0 4px 12px rgba(102, 126, 234, 0.15)'
                                      }
                                    }}
                                  >
                                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                                      <Box sx={{ color: field.type === ft.value ? '#667eea' : '#6B7280' }}>
                                        {ft.icon}
                                      </Box>
                                      <Typography
                                        sx={{
                                          fontSize: 11,
                                          fontWeight: field.type === ft.value ? 600 : 500,
                                          fontFamily: 'Inter',
                                          color: field.type === ft.value ? '#667eea' : '#374151',
                                          textAlign: 'center'
                                        }}
                                      >
                                        {ft.label}
                                      </Typography>
                                    </Box>
                                  </Card>
                                </Tooltip>
                              ))}
                            </Box>
                          </Box>

                          {/* Placeholder */}
                          {!['radio', 'checkbox', 'select'].includes(field.type) && (
                            <TextField
                              fullWidth
                              label="Placeholder Text"
                              placeholder="Helper text for the user"
                              value={field.placeholder}
                              onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                              sx={{
                                '& .MuiOutlinedInput-root': {
                                  borderRadius: 2,
                                  fontFamily: 'Inter',
                                  bgcolor: '#fff'
                                }
                              }}
                            />
                          )}

                          {/* Options for radio/checkbox/select */}
                          {['radio', 'checkbox', 'select'].includes(field.type) && (
                            <Box>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                                <Typography sx={{ fontSize: 13, fontWeight: 600, fontFamily: 'Inter', color: '#374151' }}>
                                  Options
                                </Typography>
                                <Button
                                  size="small"
                                  startIcon={<AddIcon />}
                                  onClick={() => addOption(field.id)}
                                  sx={{
                                    textTransform: 'none',
                                    fontFamily: 'Inter',
                                    fontSize: 12,
                                    fontWeight: 600
                                  }}
                                >
                                  Add Option
                                </Button>
                              </Box>

                              <Stack spacing={1}>
                                {field.options?.map((option, optIndex) => (
                                  <Box key={optIndex} sx={{ display: 'flex', gap: 1 }}>
                                    <TextField
                                      fullWidth
                                      size="small"
                                      placeholder={`Option ${optIndex + 1}`}
                                      value={option}
                                      onChange={(e) => updateOption(field.id, optIndex, e.target.value)}
                                      sx={{
                                        '& .MuiOutlinedInput-root': {
                                          borderRadius: 2,
                                          fontFamily: 'Inter',
                                          bgcolor: '#fff'
                                        }
                                      }}
                                      InputProps={{
                                        startAdornment: (
                                          <InputAdornment position="start">
                                            <Typography sx={{ fontSize: 13, color: '#9CA3AF', fontWeight: 600 }}>
                                              {String.fromCharCode(65 + optIndex)}.
                                            </Typography>
                                          </InputAdornment>
                                        )
                                      }}
                                    />
                                    <IconButton
                                      size="small"
                                      onClick={() => deleteOption(field.id, optIndex)}
                                      sx={{
                                        color: '#EF4444',
                                        '&:hover': { bgcolor: alpha('#EF4444', 0.1) }
                                      }}
                                    >
                                      <DeleteIcon fontSize="small" />
                                    </IconButton>
                                  </Box>
                                ))}

                                {(!field.options || field.options.length === 0) && (
                                  <Typography sx={{ fontSize: 12, color: '#9CA3AF', fontFamily: 'Inter', fontStyle: 'italic' }}>
                                    No options added yet. Click "Add Option" to start.
                                  </Typography>
                                )}
                              </Stack>

                              {/* Checkbox specific settings */}
                              {field.type === 'checkbox' && field.options && field.options.length > 0 && (
                                <Box sx={{ mt: 2, p: 2, bgcolor: alpha('#667eea', 0.05), borderRadius: 2 }}>
                                  <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 1.5, fontFamily: 'Inter', color: '#374151' }}>
                                    Selection Limits
                                  </Typography>
                                  <Stack direction="row" spacing={2}>
                                    <TextField
                                      size="small"
                                      type="number"
                                      label="Min Selections"
                                      value={field.minSelections || 0}
                                      onChange={(e) => updateField(field.id, { minSelections: parseInt(e.target.value) || 0 })}
                                      InputProps={{ inputProps: { min: 0, max: field.options.length } }}
                                      sx={{
                                        flex: 1,
                                        '& .MuiOutlinedInput-root': {
                                          borderRadius: 2,
                                          fontFamily: 'Inter',
                                          bgcolor: '#fff'
                                        }
                                      }}
                                    />
                                    <TextField
                                      size="small"
                                      type="number"
                                      label="Max Selections"
                                      value={field.maxSelections || field.options.length}
                                      onChange={(e) => updateField(field.id, { maxSelections: parseInt(e.target.value) || field.options.length })}
                                      InputProps={{ inputProps: { min: field.minSelections || 1, max: field.options.length } }}
                                      sx={{
                                        flex: 1,
                                        '& .MuiOutlinedInput-root': {
                                          borderRadius: 2,
                                          fontFamily: 'Inter',
                                          bgcolor: '#fff'
                                        }
                                      }}
                                    />
                                  </Stack>
                                  <Typography sx={{ fontSize: 11, color: '#6B7280', mt: 1, fontFamily: 'Inter' }}>
                                    User can select {field.minSelections || 0} to {field.maxSelections || field.options.length} options
                                  </Typography>
                                </Box>
                              )}
                            </Box>
                          )}

                          {/* Required Toggle */}
                          <FormControlLabel
                            control={
                              <Switch
                                checked={field.required}
                                onChange={(e) => updateField(field.id, { required: e.target.checked })}
                                sx={{
                                  '& .MuiSwitch-switchBase.Mui-checked': {
                                    color: '#667eea',
                                  },
                                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                    bgcolor: '#667eea',
                                  }
                                }}
                              />
                            }
                            label={
                              <Typography sx={{ fontSize: 14, fontWeight: 500, fontFamily: 'Inter' }}>
                                Required Field
                              </Typography>
                            }
                          />
                        </Stack>
                      </Box>
                    </Collapse>
                  </Card>
                ))}
              </Stack>
            )}
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ p: 3, pt: 2, borderTop: '1px solid #E5E7EB' }}>
        <Button
          onClick={onClose}
          sx={{
            textTransform: 'none',
            fontFamily: 'Inter',
            fontWeight: 600,
            color: '#6B7280'
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={!formName.trim() || fields.length === 0}
          sx={{
            textTransform: 'none',
            fontFamily: 'Inter',
            fontWeight: 600,
            borderRadius: 2,
            px: 4,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          }}
        >
          Create Form Block
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FormBlockCreator;
